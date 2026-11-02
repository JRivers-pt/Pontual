import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sandboxServer } from './server.mjs';
import { syntheticTemplate } from '../synthetic-fingerprint.mjs';
let sandbox,browser,context,page,usb,errors,blocked;
const out=process.env.SANDBOX_ARTIFACT_DIR;
const visible=locator=>locator.waitFor({state:'visible',timeout:15000});
const eventually=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}assert.fail('Sandbox state did not converge');};
before(async()=>{
    sandbox=await sandboxServer();
    browser=await chromium.launch({channel:process.env.SANDBOX_BROWSER_CHANNEL||'msedge',headless:true});
    if(out)fs.mkdirSync(out,{recursive:true});
});
beforeEach(async()=>{
    await sandbox.reset();errors=[];blocked=[];
    usb={mode:'ready',scans:0,verifies:0,mismatch:false,gate:null,deviceProbePorts:[],failHttp8082:false,failedProbes:0,fallbackObserved:false};
    context=await browser.newContext({viewport:{width:1440,height:1080},serviceWorkers:'block'});
    await context.addCookies([{name:'sandbox-session',value:'operator',url:sandbox.origin}]);
    await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.hostname==='localhost'&&['8081','8082'].includes(url.port)){
            if(usb.mode==='unreachable')return route.abort('connectionrefused');
            let body;
            if(url.pathname==='/api/devices'){
                usb.deviceProbePorts.push(`${url.protocol}//${url.host}`);
                if(usb.failHttp8082&&url.protocol==='http:'&&url.port==='8082'){usb.failedProbes++;return route.abort('connectionreset');}
                if(usb.failHttp8082&&url.protocol==='http:'&&url.port==='8081'){usb.fallbackObserved=true;usb.failHttp8082=false;}
                // Match the captured USB Agent contract; the hardware identifier stays synthetic.
                body={retcode:'1',Devices:usb.mode==='missing'?'':[{id:'synthetic-biominiplus2',fingerprint:'true',type:'1007',name:'BioMini Plus2'}]};
            }
            else if(url.pathname==='/api/ScanBiomini'){
                assert.equal(url.searchParams.get('template_type'),'2001');usb.scans++;
                if(usb.gate)await usb.gate;
                body=usb.mode==='capture-failure'?{retcode:'0'}:{retcode:'1',template:syntheticTemplate(usb.scans),score:85};
                if(usb.mode==='invalid-template')body.template='AA==';
                if(usb.mode==='failed-with-template')body.retcode='0';
            }else if(url.pathname==='/api/Verify'){
                usb.verifies++;const form=new URLSearchParams(req.postData());
                assert.equal(form.get('template_type'),'2001');assert.equal(form.get('template1'),syntheticTemplate(usb.scans-1));assert.equal(form.get('template2'),syntheticTemplate(usb.scans));
                body={retcode:usb.mismatch?'0':'1'};
            }else throw new Error('Unexpected USB sandbox path');
            return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
        }
        if(url.origin===sandbox.origin)return route.continue();
        blocked.push(url.origin);return route.abort('blockedbyclient');
    });
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(sandbox.origin);await visible(page.getByRole('heading',{name:'Gestão de Colaboradores'}));
    await eventually(()=>sandbox.prisma.employee.count().then(n=>n===0));
});
afterEach(async t=>{
    try{
        if(out)await page.screenshot({path:path.join(out,t.name.replace(/[^a-zA-Z0-9]+/g,'-')+'.png'),fullPage:true});
        assert.deepEqual(errors,[],'No React/browser runtime exceptions');
        assert.deepEqual(blocked,[],'No attempt to contact a production/external site');
        assert.equal(sandbox.native.assertOriginal(),true,'Original synthetic administrator unchanged');
    }finally{await context?.close();}
});
after(async()=>{await browser?.close();await sandbox?.close();});
async function openCreate(name='Pessoa Sandbox',workno='0908'){
    await page.getByRole('button',{name:'Adicionar Colaborador',exact:true}).click();
    await page.getByLabel('Nº Mecanográfico (ID) *',{exact:true}).fill(workno);
    await page.getByLabel('Nome Completo *',{exact:true}).fill(name);
}
async function capturePair(){
    await page.getByRole('button',{name:'Capturar Impressão Digital via USB',exact:true}).click();
    await visible(page.getByText(/Primeira leitura concluída/));
    assert.equal(await page.getByRole('button',{name:'Criar Colaborador',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Capturar segunda leitura do mesmo dedo',exact:true}).click();
    await visible(page.getByText(/Duas leituras verificadas/));
}
async function saveCreate(){await page.getByRole('button',{name:'Criar Colaborador',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});}
const employeeRow=()=>page.getByRole('row').filter({hasText:'Pessoa Sandbox'});
async function createBiometric(){await openCreate();await capturePair();await saveCreate();await visible(employeeRow());}

test('browser: complete create, persist, three-terminal export and correctly mapped entry punch',async()=>{
    await createBiometric();assert.equal(usb.scans,2);assert.equal(usb.verifies,1);
    assert.equal(await sandbox.prisma.employee.count(),1);assert.equal(await sandbox.prisma.employeeSchedule.count(),1);assert.equal(await sandbox.prisma.enrollmentTask.count(),3);
    const employee=await sandbox.prisma.employee.findFirst();assert.equal(employee.workno,'0908');assert.equal(JSON.parse(employee.fingerprintTemplate).templateType,2001);
    await page.reload();await visible(employeeRow().getByText('Guardada (1)',{exact:true}));
    await sandbox.drain();assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    assert.equal(sandbox.native.calls.filter(c=>c.path==='/api/server_matching/identify_finger').length,3);
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
    for(const terminal of sandbox.native.devices.values()){
        const native=terminal.get('1000908');assert.equal(native.name,'Pessoa Sandbox');assert.equal(native.disabled,'false');assert.equal(native.fingerprint_templates.length,1);
    }
    const punch={workno:'1000908',employeeName:'Pessoa Sandbox',checktime:'2026-10-29T08:00:00.000Z',checktype:0,rawEventId:'synthetic-passage'};
    for(let i=0;i<2;i++)assert.equal((await fetch(sandbox.origin+'/api/sync/punches',{method:'POST',headers:{'x-school-token':'sandbox-only-token','Content-Type':'application/json'},body:JSON.stringify({punches:[punch]})})).status,200);
    assert.equal(await sandbox.prisma.attendanceLog.count(),1);
    const actual=await sandbox.prisma.attendanceLog.findFirst();assert.equal(actual.workno,'0908');assert.equal(actual.checktype,0);
});
test('browser: a fingerprint already owned by another BioStar user blocks all terminal exports',async()=>{
    await createBiometric();
    sandbox.native.users.set('777',{user_id:'777',name:'Pessoa Existente',disabled:'false',updated_count:'1',fingerprint_templates:[{template0:syntheticTemplate(1),template1:syntheticTemplate(2)}]});
    await sandbox.drain();
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'ERROR'}}),3);
    assert.equal(sandbox.native.users.has('1000908'),false);
    assert.equal(sandbox.native.calls.some(c=>c.path==='/api/users/export'),false);
});
test('browser: a saved employee remains visible when the follow-up list request fails',async()=>{
    await openCreate();await capturePair();sandbox.faults.listFailures=1;await saveCreate();
    await visible(employeeRow());await visible(page.getByRole('alert').filter({hasText:'Não foi possível atualizar a lista'}));
    await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});
    await page.reload();await visible(employeeRow());assert.equal(await sandbox.prisma.employee.count(),1);
});
for(const fault of ['deferred','staleReadback','missingTemplates']){
    test(`browser: accepted export with ${fault} never becomes a confirmed terminal until retry verifies it`,async()=>{
        await createBiometric();sandbox.native[fault].add('1');await sandbox.drain();
        const tasks=await sandbox.prisma.enrollmentTask.findMany();
        const failed=tasks.find(task=>task.terminalId==='1');
        assert.equal(failed.status,'ERROR');assert.equal(failed.lastError,'O terminal ainda não confirmou os dados enviados. Nova tentativa automática.');
        assert.equal(tasks.filter(task=>task.status==='EXPORTED').length,2);
        if(fault==='deferred')assert.equal(sandbox.native.devices.get('1').has('1000908'),false);
        await page.reload();await visible(employeeRow());
        assert.equal(await employeeRow().getByText(/BioStar aceitou 3\/3/).count(),0);
        assert.equal(await sandbox.prisma.employee.count(),1);
        sandbox.native[fault].clear();await sandbox.releaseRetries();await sandbox.drain();
        assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
        for(const terminal of sandbox.native.devices.values()){
            const user=terminal.get('1000908');assert.equal(user.disabled,'false');
            assert.equal(user.fingerprint_templates[0].template0,syntheticTemplate(1));
            assert.equal(user.fingerprint_templates[0].template1,syntheticTemplate(2));
        }
        await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
    });
}
test('browser: a real worker process killed after export recovers the persistent lease without duplicate users',async()=>{
    await createBiometric();
    const first=await sandbox.processCycle({crashAfterExport:true});assert.equal(first.crashed,true);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'PROCESSING'}}),1);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),0);
    assert.equal(sandbox.native.users.size,2); // Existing synthetic administrator plus new person.
    assert.equal([...sandbox.native.devices.values()].filter(d=>d.has('1000908')).length,1);
    const active=await sandbox.prisma.enrollmentTask.findFirst({where:{status:'PROCESSING'}});
    const nativeCallsBeforeRestart=sandbox.native.calls.length;
    const blocked=await sandbox.processCycle();assert.notEqual(blocked.pid,first.pid);
    assert.equal(sandbox.native.calls.length,nativeCallsBeforeRestart);
    assert.equal(blocked.result.failed,0); // Live lease prevents a second process taking sibling work.
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),0);
    // Advance only the synthetic lease in the disposable DB; no clock or real service changes.
    await sandbox.prisma.enrollmentTask.update({where:{id:active.id},data:{leaseExpiresAt:new Date(0),nextAttemptAt:new Date(0)}});
    for(let i=0;i<3;i++){
        const resumed=await sandbox.processCycle();assert.notEqual(resumed.pid,first.pid);assert.equal(resumed.result.failed,0);
    }
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    assert.equal(sandbox.native.calls.filter(c=>c.path==='/api/users'&&c.method==='POST').length,1);
    assert.equal(sandbox.native.users.size,2);assert.equal(await sandbox.prisma.employee.count(),1);
    for(const terminal of sandbox.native.devices.values())assert.equal(terminal.get('1000908').fingerprint_templates.length,1);
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
});
test('browser: save failure retains the form and retry commits once',async()=>{
    await openCreate();await capturePair();sandbox.faults.saveFailures=1;
    await page.getByRole('button',{name:'Criar Colaborador',exact:true}).click();await visible(page.getByText('Falha simulada ao guardar',{exact:true}));
    assert.equal(await sandbox.prisma.employee.count(),0);assert.equal(await page.getByLabel('Nome Completo *',{exact:true}).inputValue(),'Pessoa Sandbox');
    await saveCreate();assert.equal(await sandbox.prisma.employee.count(),1);assert.equal(await sandbox.prisma.enrollmentTask.count(),3);
});
test('browser: mismatched fingerprints remain uncommitted and can be recaptured',async()=>{
    await openCreate();usb.mismatch=true;
    await page.getByRole('button',{name:'Capturar Impressão Digital via USB',exact:true}).click();
    await page.getByRole('button',{name:'Capturar segunda leitura do mesmo dedo',exact:true}).click();
    await visible(page.getByText(/As duas leituras não foram confirmadas/));assert.equal(await sandbox.prisma.employee.count(),0);
    usb.mismatch=false;await capturePair();await saveCreate();assert.equal(usb.scans,4);assert.equal(await sandbox.prisma.employee.count(),1);
});
test('browser: missing reader and unreachable agent show different errors',async()=>{
    usb.mode='missing';await openCreate();await visible(page.getByText(/O agente USB responde, mas não deteta o leitor/));
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();usb.mode='unreachable';await openCreate();
    await visible(page.getByText(/O browser não consegue aceder ao USB Agent/));assert.equal(await sandbox.prisma.employee.count(),0);
});
test('browser: USB agent recovers after a transient empty connection on the first port',async()=>{
    await openCreate();usb.failHttp8082=true;
    await page.getByRole('button',{name:'Capturar Impressão Digital via USB',exact:true}).click();
    await visible(page.getByText(/Primeira leitura concluída/));
    assert.ok(usb.failedProbes>=1);assert.equal(usb.fallbackObserved,true);assert.equal(usb.scans,1);
    assert.ok(usb.deviceProbePorts.indexOf('http://localhost:8082')<usb.deviceProbePorts.indexOf('http://localhost:8081'));
    assert.equal(await sandbox.prisma.employee.count(),0);
});
for(const [mode,message] of [['invalid-template',/inválida ou incompleta/],['failed-with-template',/sem capturar/]]){
    test(`browser: ${mode} cannot be verified or persisted and recapture recovers`,async()=>{
        await openCreate();usb.mode=mode;
        await page.getByRole('button',{name:/Capturar Impressão Digital/}).click();
        await visible(page.getByText(message));
        assert.equal(usb.verifies,0);
        assert.equal(await sandbox.prisma.employee.count(),0);
        assert.equal(await sandbox.prisma.enrollmentTask.count(),0);
        usb.mode='ready';await capturePair();await saveCreate();
        assert.equal(usb.verifies,1);
        assert.equal(await sandbox.prisma.employee.count(),1);
        assert.equal(await sandbox.prisma.enrollmentTask.count(),3);
        const pair=JSON.parse((await sandbox.prisma.employee.findFirst()).fingerprintTemplate);
        assert.equal(pair.template0,syntheticTemplate(2));assert.equal(pair.template1,syntheticTemplate(3));
    });
}
test('browser: closing an in-flight capture cannot attach it to a new employee',async()=>{
    await openCreate();let release;usb.gate=new Promise(r=>{release=r;});
    await page.getByRole('button',{name:'Capturar Impressão Digital via USB',exact:true}).click();await eventually(()=>usb.scans===1);
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();release();usb.gate=null;
    await openCreate('Outra Pessoa Sandbox','0909');await saveCreate();
    const employee=await sandbox.prisma.employee.findFirst();assert.equal(employee.workno,'0909');assert.equal(employee.fingerprintTemplate,null);assert.equal(employee.numFingerprints,0);
});
test('browser: a terminal failure is visible, other terminals progress and retry recovers',async()=>{
    await createBiometric();sandbox.native.offline.add('2');await sandbox.drain();
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),2);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'ERROR'}}),1);
    await page.reload();await visible(employeeRow().getByText(/Envio com falha \(2\/3\)/));
    sandbox.native.offline.clear();await sandbox.releaseRetries();await sandbox.cycle();
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));assert.equal(sandbox.native.users.size,2);
});
test('browser: lost native create response recovers its disabled placeholder without duplicates',async()=>{
    await createBiometric();sandbox.native.loseNextCreate();assert.equal((await sandbox.cycle()).failed,1);
    assert.equal(sandbox.native.users.get('1000908').disabled,'true');
    await sandbox.releaseRetries();await sandbox.drain(4);
    assert.equal(sandbox.native.calls.filter(c=>c.path==='/api/users'&&c.method==='POST').length,1);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
});
test('browser: rename, disable, reactivate and delete preserve identity and revoke all terminals',async()=>{
    await createBiometric();await sandbox.drain();
    await employeeRow().getByTitle('Editar Colaborador / Biometria').click();await page.getByLabel('Nome Completo *',{exact:true}).fill('Pessoa Sandbox Editada');
    await page.getByRole('button',{name:'Guardar Alterações',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await sandbox.drain();assert.equal(sandbox.native.users.size,2);assert.equal(sandbox.native.users.get('1000908').name,'Pessoa Sandbox Editada');
    await employeeRow().getByTitle('Clique para desativar').click();await eventually(()=>sandbox.prisma.employee.findFirst().then(e=>!e.active));await sandbox.drain();
    for(const terminal of sandbox.native.devices.values())assert.equal(terminal.get('1000908').disabled,'true');
    await employeeRow().getByTitle('Clique para ativar').click();await eventually(()=>sandbox.prisma.employee.findFirst().then(e=>e.active));await sandbox.drain();
    await employeeRow().getByTitle('Editar Colaborador / Biometria').click();page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Eliminar',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await sandbox.prisma.employee.count(),0);assert.equal(await sandbox.prisma.enrollmentTask.count({where:{active:false}}),3);await sandbox.drain();
    for(const terminal of sandbox.native.devices.values())assert.equal(terminal.get('1000908').disabled,'true');
});
test('browser: enrollment preserves 83 existing terminal identities with capped 50-row readbacks',async()=>{
    const employees=[];
    for(let i=1;i<=82;i++){
        const uid=String(2000000+i),name=`Pessoa Existente Sintetica ${i}`;
        const user={user_id:uid,name,disabled:'false',updated_count:'1',fingerprint_templates:i<=42?[{template0:syntheticTemplate(i+50),template1:syntheticTemplate(i+150),finger_mask:'false'}]:[]};
        sandbox.native.users.set(uid,structuredClone(user));
        for(const terminal of sandbox.native.devices.values())terminal.set(uid,structuredClone(user));
        employees.push({userId:sandbox.schoolId,workno:String(1100+i),name,active:true});
    }
    await sandbox.prisma.employee.createMany({data:employees});
    const previous=structuredClone(sandbox.native.users);
    assert.equal(previous.size,83);sandbox.native.paging.size=50;
    await page.reload();await createBiometric();await sandbox.drain();
    assert.equal(await sandbox.prisma.employee.count(),83);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    assert.equal(sandbox.native.users.size,84);
    for(const [id,user] of previous){
        assert.deepEqual(sandbox.native.users.get(id),user);
        for(const terminal of sandbox.native.devices.values())assert.deepEqual(terminal.get(id),user);
    }
    for(const id of ['1','2','3']){
        assert.equal(sandbox.native.devices.get(id).size,84);
        assert.ok(sandbox.native.calls.some(c=>c.path===`/api/devices/${id}/users`&&c.offset==='50'));
        assert.equal(sandbox.native.devices.get(id).get('1000908').disabled,'false');
    }
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
});
for(const change of ['rename','disable','delete']){
    test(`browser: ${change} during export invalidates the old receipt and converges after lease expiry`,async()=>{
        await createBiometric();let changed=false;
        sandbox.faults.afterExport=async()=>{
            const response=change==='delete'
                ?await context.request.delete(sandbox.origin+'/api/employees?workno=0908')
                :await context.request.put(sandbox.origin+'/api/employees',{data:{workno:'0908',...(change==='rename'?{name:'Pessoa Sandbox Atualizada'}:{active:false})}});
            assert.equal(response.status(),200);changed=true;
        };
        await sandbox.cycle();assert.equal(changed,true);
        assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),0,'old receipt must not confirm the new revision');
        const active=await sandbox.prisma.enrollmentTask.findFirst({where:{status:'PROCESSING'}});assert.ok(active);
        const writes=sandbox.native.calls.filter(c=>c.path==='/api/users/export').length;
        await sandbox.cycle();assert.equal(sandbox.native.calls.filter(c=>c.path==='/api/users/export').length,writes,'live lease must block sibling work');
        await sandbox.prisma.enrollmentTask.update({where:{id:active.id},data:{leaseExpiresAt:new Date(0),nextAttemptAt:new Date(0)}});
        await sandbox.drain(4);
        assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
        assert.equal(sandbox.native.users.size,2);
        for(const terminal of sandbox.native.devices.values()){
            const user=terminal.get('1000908');assert.ok(user);
            assert.equal(user.disabled,change==='rename'?'false':'true');
            if(change==='rename')assert.equal(user.name,'Pessoa Sandbox Atualizada');
        }
        assert.equal(await sandbox.prisma.employee.count(),change==='delete'?0:1);
        await page.reload();
        if(change==='delete')await eventually(()=>employeeRow().count().then(n=>n===0));
        else await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
    });
}
test('browser: BioStar 1205 blocks all credential writes, explains the failure and recovers on retry',async()=>{
    await createBiometric();sandbox.native.matching.unavailable=true;
    await sandbox.drain();
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'ERROR'}}),3);
    assert.equal(sandbox.native.users.size,1);
    assert.equal(sandbox.native.calls.some(c=>c.path==='/api/users/export'||c.path==='/api/users'&&c.method==='POST'||c.method==='PUT'),false);
    await page.reload();await visible(employeeRow().getByText(/Não foi possível verificar se a digital já existe no BioStar/));
    sandbox.native.matching.unavailable=false;await sandbox.releaseRetries();await sandbox.drain();
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    assert.equal(sandbox.native.users.size,2);
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
});
test('browser: expired BioStar session during update keeps an error visible and a fresh login recovers',async()=>{
    await createBiometric();sandbox.faults.unauthorizedUpdate=true;
    assert.equal((await sandbox.cycle()).failed,1);
    assert.equal(sandbox.native.calls.some(c=>c.path==='/api/users/export'),false);
    assert.equal(sandbox.native.users.get('1000908').disabled,'true');
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'ERROR'}}),1);
    await page.reload();await visible(employeeRow().getByText(/Envio com falha/));
    await sandbox.releaseRetries();await sandbox.drain(4);
    assert.equal(await sandbox.prisma.enrollmentTask.count({where:{status:'EXPORTED'}}),3);
    assert.equal(sandbox.native.users.size,2);
    for(const terminal of sandbox.native.devices.values())assert.equal(terminal.get('1000908').disabled,'false');
    await page.reload();await visible(employeeRow().getByText(/BioStar aceitou 3\/3/));
});
test('browser: mobile form remains usable and synthetic session never bypasses backend authorization',async()=>{
    await page.setViewportSize({width:390,height:844});await openCreate();
    assert.equal(await page.getByRole('button',{name:'Criar Colaborador',exact:true}).isVisible(),true);
    await context.clearCookies();await page.getByRole('button',{name:'Criar Colaborador',exact:true}).click();
    await visible(page.getByText('Unauthorized',{exact:true}));assert.equal(await sandbox.prisma.employee.count(),0);
    assert.equal((await fetch(sandbox.origin+'/api/sync/enrollments')).status,401);
});
