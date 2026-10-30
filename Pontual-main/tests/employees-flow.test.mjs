import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as format from '../school-agent/fingerprint-format.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// Executes the real component's handlers and hooks without a DOM. It does not claim browser/hardware coverage.
const source = ts.transpileModule(fs.readFileSync(new URL('../src/app/(dashboard)/employees/page.tsx', import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    return node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
}
const response = (body, ok = true) => ({ ok, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function component({ store = [], listFailure = false, list, save, capture, verify } = {}) {
    const state = [], calls = []; let cursor = 0, tree, scans = 0;
    const hooks = {
        useState(initial) { const i=cursor++; if (!(i in state)) state[i] = typeof initial==='function' ? initial() : initial; return [state[i], next => { state[i] = typeof next==='function' ? next(state[i]) : next; }]; },
        useRef(initial) { const i=cursor++; return state[i] ||= { current: initial }; },
        useMemo(fn) { return fn(); }, useEffect() {},
    };
    const ui = new Proxy({}, { get: (_,name) => String(name) });
    const react = { __esModule: true, default: hooks, ...hooks };
    const fetch = async (url, options = {}) => {
        calls.push({url,...options});
        if (url.includes('sync-status')) return response({ enabled:true,online:true,terminalCount:3,terminalIds:['1','2','3'],tasks:[] });
        if (options.method === 'POST' || options.method === 'PUT') {
            const input=JSON.parse(options.body);
            if (save) return save(input);
            const employee={ ...input,id:'synthetic',numFingerprints:input.fingerprintTemplate ? 1 : 0 };
            store.push(employee); return response({success:true,employee});
        }
        return list ? list() : listFailure ? response({},false) : response({employees:[...store]});
    };
    const context={exports:{},console,fetch,window:{setInterval(){},clearInterval(){},confirm:()=>true},require:name=>{
        if(name==='react')return react;
        if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
        if(name==='next-auth/react')return {useSession:()=>({data:{user:{company:'Colégio Manuel Bernardes',role:'ADMIN'}}})};
        if(name==='@/lib/fingerprint-format')return format;
        if(name==='@/lib/enrollment-status')return {enrollmentStatusText:()=> 'Envio pendente'};
        if(name==='@/lib/usb-scanner')return {
            findUsbScanner:async()=>({url:'http://localhost:8082',name:'BioMini Plus2'}),
            captureUsbFingerprint:capture || (async()=>({template:`sample-${++scans}`,quality:80,image:null})),
            verifyUsbFingerprintPair:verify || (async()=>{}),
        };
        if(name==='next/link')return {__esModule:true,default:'Link'};
        if(name.startsWith('@/components/')||name==='lucide-react')return ui;
        throw new Error('UNMOCKED_IMPORT '+name);
    }};
    vm.runInNewContext(source,context);
    const render=()=>{cursor=0;tree=context.exports.default();return tree;}; render();
    const find=(type,predicate=()=>true)=>{render(); const n=nodes(tree).find(n=>n.type===type&&predicate(n));assert.ok(n,`Missing ${type}`);return n;};
    const button=label=>find('Button',n=>text(n).trim()===label);
    const field=(id,value)=>find('Input',n=>n.props.id===id).props.onChange({target:{value}});
    const create=()=>{button('Adicionar Colaborador').props.onClick();field('name','Pessoa Sintética');};
    const submit=()=>find('form').props.onSubmit({preventDefault(){}});
    const scan=()=>find('Button',n=>typeof n.props.onClick==='function'&&/Capturar|Recapturar/.test(text(n))).props.onClick();
    return {render,find,button,field,create,submit,scan,calls,allText:()=>text(render())};
}

test('component: verified pair is saved and the employee appears even when refreshing the list fails', async()=>{
    const app=component({listFailure:true}); app.create();
    await app.scan();
    assert.equal(app.button('Criar Colaborador').props.disabled,true);
    await app.submit();
    assert.equal(app.calls.some(c=>c.method==='POST'),false);
    await app.scan(); await app.submit();
    const sent=JSON.parse(app.calls.find(c=>c.method==='POST').body);
    assert.equal(JSON.parse(sent.fingerprintTemplate).templateType,2001);
    assert.equal(sent.scheduleCode,'H9');
    assert.equal(app.find('Dialog').props.open,false);
    assert.match(app.allText(),/Pessoa Sintética/);
    assert.match(app.allText(),/Não foi possível atualizar a lista/);
    assert.match(app.allText(),/guardado no Pontualidade/);
});
test('component: double submit makes one save request and disables capture while saving', async()=>{
    const wait=deferred(); const app=component({save:()=>wait.promise}); app.create();
    const submit=app.find('form').props.onSubmit;
    const first=submit({preventDefault(){}}); await submit({preventDefault(){}});
    assert.equal(app.calls.filter(c=>c.method==='POST').length,1);
    assert.equal(app.find('Button',n=>/Capturar Impressão/.test(text(n))).props.disabled,true);
    wait.resolve(response({success:true,employee:{id:'test',workno:'0083',name:'Pessoa Sintética',active:true,numFingerprints:0}}));
    await first;
});
test('component: a failed save retains the form and allows a successful retry',async()=>{
    let attempts=0;
    const app=component({save:async()=>++attempts===1 ? response({error:'Falha simulada'},false) : response({success:true})}); app.create();
    await app.submit();
    assert.equal(app.find('Dialog').props.open,true);
    assert.match(app.allText(),/Falha simulada/);
    assert.equal(app.find('Input',n=>n.props.id==='name').props.value,'Pessoa Sintética');
    await app.submit(); assert.equal(attempts,2); assert.equal(app.find('Dialog').props.open,false);
});
test('component: closing during capture discards the late result and a new form starts clean',async()=>{
    const wait=deferred();const app=component({capture:()=>wait.promise});app.create();
    const pending=app.scan();await Promise.resolve();
    app.button('Cancelar').props.onClick();
    wait.resolve({template:'late-sample',quality:80,image:null});await pending;
    app.create();
    assert.equal(app.button('Criar Colaborador').props.disabled,false);
    assert.doesNotMatch(app.allText(),/Primeira leitura concluída/);
});
test('component: mismatched samples cannot save a partial fingerprint',async()=>{
    const app=component({verify:async()=>{throw new Error('As leituras devem ser do mesmo dedo');}});app.create();
    await app.scan();await app.scan();await app.submit();
    const sent=JSON.parse(app.calls.find(c=>c.method==='POST').body);
    assert.equal('fingerprintTemplate' in sent,false);
});
test('component: a fresh page reload retrieves the saved employee',async()=>{
    const store=[];const app=component({store});app.create();await app.scan();await app.scan();await app.submit();
    const reload=component({store});await reload.button('Atualizar').props.onClick();
    assert.match(reload.allText(),/Pessoa Sintética/);assert.match(reload.allText(),/Guardada \(\s*1\s*\)/);
});
test('component: a late older list response cannot erase an employee just saved',async()=>{
    const old=deferred(); let reads=0;
    const app=component({list:()=>++reads===1 ? old.promise : response({},false)});
    const refresh=app.button('Atualizar').props.onClick();
    app.create();await app.submit();
    old.resolve(response({employees:[]}));await refresh;
    assert.match(app.allText(),/Pessoa Sintética/);
    assert.match(app.allText(),/Não foi possível atualizar a lista/);
});
