import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { isolatedDatabase } from './database.mjs';
import { nativeEmulator } from './native-emulator.mjs';
import * as fingerprintFormat from '../../school-agent/fingerprint-format.mjs';
import { runOnce, request } from '../../school-agent/enrollment-agent.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=fileURLToPath(new URL('../../',import.meta.url));

export async function sandboxServer(){
    const db=await isolatedDatabase();let server;
    try{
        const native=nativeEmulator(),modules=new Map();
        function load(relative){
            const file=path.resolve(root,relative);if(modules.has(file))return modules.get(file);
            const exports={};modules.set(file,exports);
            const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
            const context={exports,Date,Error,URL,Headers,console:{error(){}},
                process:{env:{ENROLLMENT_SYNC_USER_ID:db.schoolId,ENROLLMENT_TERMINAL_IDS:'1,2,3'}},
                fetch:async()=>{throw new Error('UNEXPECTED_BACKEND_NETWORK_BLOCKED');},
                require:name=>{
                    if(name==='@/lib/db')return {prisma:db.prisma};
                    if(name==='@/auth')return {auth:handler=>handler};
                    if(name==='next/server')return {NextResponse:{json:(body,options={})=>({body,status:options.status||200})}};
                    if(name==='@/lib/fingerprint-format')return fingerprintFormat;
                    if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice(6)+'.ts');
                    if(name==='node:crypto')return require(name);
                    throw new Error('UNEXPECTED_SERVER_IMPORT');
                }};
            vm.runInNewContext(code,context,{filename:relative});return exports;
        }
        const routes=new Map([
            ['/api/employees',load('src/app/api/employees/route.ts')],
            ['/api/employees/sync-status',load('src/app/api/employees/sync-status/route.ts')],
            ['/api/sync/enrollments',load('src/app/api/sync/enrollments/route.ts')],
            ['/api/sync/punches',load('src/app/api/sync/punches/route.ts')],
        ]);
        const bundle=await build({entryPoints:[path.join(root,'tests/sandbox/entry.tsx')],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
            alias:{'next-auth/react':path.join(root,'tests/sandbox/session.tsx'),'next/link':path.join(root,'tests/sandbox/link.tsx')},logLevel:'silent'});
        const cssDir=path.join(root,'.next/static/chunks');
        const css=fs.existsSync(cssDir)?fs.readdirSync(cssDir).filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync(path.join(cssDir,n),'utf8')).join('\n'):'';
        if(!css)throw new Error('RUN_BUILD_BEFORE_BROWSER_TESTS');
        const faults={listFailures:0,saveFailures:0,unauthorizedUpdate:false,afterExport:null};const stats={saves:0};
        const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body);};
        server=http.createServer(async(req,res)=>{
            try{
                const url=new URL(req.url,'http://127.0.0.1');
                if(req.method==='GET'&&url.pathname==='/')return send(res,200,'<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/sandbox.css"><title>Pontualidade — Sandbox</title></head><body style="padding:24px;background:#fafafa"><aside style="padding:12px;margin-bottom:20px;border:2px solid #d97706;background:#fffbeb;font-weight:bold">SANDBOX — dados e biometria sintéticos; equipamentos simulados</aside><main id="root"></main><script src="/sandbox.js"></script></body></html>','text/html');
                if(url.pathname==='/sandbox.js')return send(res,200,bundle.outputFiles[0].text,'application/javascript');
                if(url.pathname==='/sandbox.css')return send(res,200,css,'text/css');
                if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
                const handler=routes.get(url.pathname)?.[req.method];
                if(!handler)return send(res,404,{error:'Sandbox route not found'});
                if(url.pathname==='/api/employees'){
                    if(req.method==='GET'&&faults.listFailures>0){faults.listFailures--;return send(res,503,{error:'Lista temporariamente indisponível — sandbox'});}
                    if(req.method==='POST'){
                        stats.saves++;
                        if(faults.saveFailures>0){faults.saveFailures--;return send(res,503,{error:'Falha simulada ao guardar'});}
                    }
                }
                let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw new Error('SANDBOX_REQUEST_LIMIT');}
                const next={url:url.toString(),nextUrl:url,headers:new Headers(req.headers),
                    auth:req.headers.cookie?.split(';').some(c=>c.trim()==='sandbox-session=operator')?{user:{id:db.schoolId,name:'Operador Sandbox',role:'ADMIN'}}:null,
                    json:async()=>JSON.parse(raw||'null')};
                const result=await handler(next);send(res,result.status,result.body);
            }catch{send(res,500,{error:'SANDBOX_REQUEST_FAILED'});}
        });
        server.listen(0,'127.0.0.1');await once(server,'listening');
        const origin='http://127.0.0.1:'+server.address().port;
        const config={cloudUrl:origin,token:'sandbox-only-token',biostarUrl:'https://biostar.sandbox.invalid',login:'synthetic',password:'synthetic',terminals:['1','2','3'],userMap:{},allowNumericIds:true,newUserIdOffset:1000000,accessGroups:[],allowNoAccessGroups:true,userGroup:'1'};
        const transport=async(url,options)=>{
            if(new URL(url).origin===origin)return request(url,options);
            const target=new URL(url);
            if(target.origin==='https://biostar.sandbox.invalid'&&options?.method==='PUT'&&faults.unauthorizedUpdate){
                faults.unauthorizedUpdate=false;
                return {status:401,body:{Response:{code:'10',message:'Login required.'}}};
            }
            const result=await native.transport(url,options); // Its own origin allowlist blocks every other URL.
            if(target.pathname==='/api/users/export'&&faults.afterExport){
                const hook=faults.afterExport;faults.afterExport=null;await hook();
            }
            return result;
        };
        const close=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();};
        const reset=async()=>{await db.reset();native.reset();faults.listFailures=0;faults.saveFailures=0;faults.unauthorizedUpdate=false;faults.afterExport=null;stats.saves=0;};
        const cycle=()=>runOnce(config,transport);
        const processCycle=({crashAfterExport=false}={})=>new Promise((resolve,reject)=>{
            // No inherited application/DB/production environment in the child.
            const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(path|pathext|systemroot|windir|comspec|temp|tmp)$/i.test(key)));
            const child=fork(fileURLToPath(new URL('./worker-process.mjs',import.meta.url)),[],{env,execArgv:[],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
            let crashed=false,result,failed=false,timeout=false;
            child.stderr.on('data',()=>{}); // Expected synthetic failures; no credentials or vendor payloads emitted.
            const timer=setTimeout(()=>{timeout=true;child.kill();},20000);
            child.once('error',error=>{clearTimeout(timer);reject(error);});
            child.once('exit',(code)=>{clearTimeout(timer);
                if(timeout||failed||!crashed&&(code!==0||!result))reject(new Error('SANDBOX_WORKER_PROCESS_FAILED'));
                else resolve({pid:child.pid,crashed,result});
            });
            child.on('message',async message=>{
                if(message.type==='done'){result=message.result;return;}
                if(message.type==='failed'){failed=true;return;}
                if(message.type!=='call')return;
                try{
                    const response=await transport(message.url,message.options);
                    if(crashAfterExport&&new URL(message.url).pathname==='/api/users/export'){
                        crashed=true;child.kill();return; // Remote write happened, before readback and cloud receipt.
                    }
                    if(child.connected)child.send({type:'reply',id:message.id,result:{...response,headers:Object.fromEntries(response.headers||[])}});
                }catch{
                    if(child.connected)child.send({type:'reply',id:message.id,error:'SANDBOX_TRANSPORT_FAILURE'});
                }
            });
            child.send({type:'start',config});
        });
        const drain=async(count=3)=>{for(let i=0;i<count;i++)await cycle();};
        return {...db,origin,close,reset,native,config,faults,stats,cycle,drain,processCycle,
            releaseRetries:()=>db.prisma.enrollmentTask.updateMany({where:{status:'ERROR'},data:{nextAttemptAt:new Date(0)}})};
    }catch(error){if(server){server.closeAllConnections();server.close();}await db.close();throw error;}
}
