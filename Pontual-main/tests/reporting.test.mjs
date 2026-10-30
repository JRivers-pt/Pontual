import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { jsPDF } = require('jspdf');
const table = require('jspdf-autotable').default;
function load(file, overrides = {}, globals = {}) {
    const js = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const context = { exports: {}, console, URL, Headers, Response, Buffer, Date, process: { env: {} },
        require: name => name in overrides ? overrides[name] : require(name),
        fetch: async () => { throw new Error('Network forbidden in reporting tests'); }, ...globals };
    vm.runInNewContext(js, context);
    return context.exports;
}
const data = Array.from({ length: 30 }, (_, day) => ['Colaborador de Teste A', 'Colaborador de Teste B'].map((funcionario, index) => ({
    data: `${String(day + 1).padStart(2,'0')}/10/2026`, funcionario, id: `TEST-${index + 1}`, departamento: 'Teste',
    entrada: '08:00', saida: '17:00', duracao: index === 1 && day === 4 ? 'Falta' : '8h 0m', horasExtra: '0h 0m', movimentos: '08:00 / 17:00',
}))).flat();
for (const mode of ['summary','detailed','matrix','monthly']) {
    test(`real PDF export with synthetic data: ${mode}`, async () => {
        const docs = [], saved = [];
        function CapturePDF(...args) {
            const doc = new jsPDF(...args); docs.push(doc);
            doc.save = () => { saved.push(doc); };
            return doc;
        }
        const api = load('../src/lib/exports.ts', { jspdf: { default: CapturePDF }, 'jspdf-autotable': { default: table } });
        if (mode === 'monthly') await api.exportToMensalPDF(data, '01/10/2026 a 30/10/2026', 'Teste de exportacao');
        else await api.exportToPDF(data, '01/10/2026 a 30/10/2026', 'Teste de exportacao', mode, undefined, 'Escola sintetica');
        assert.equal(saved.length, 1);
        const doc = saved[0], bytes = Buffer.from(doc.output('arraybuffer'));
        assert.equal(bytes.subarray(0,5).toString(), '%PDF-');
        assert.ok(bytes.length > 1000);
        assert.ok(doc.getNumberOfPages() >= 1);
        assert.ok(doc.lastAutoTable.finalY < doc.internal.pageSize.getHeight() - 5);
        if (mode === 'matrix') {
            assert.equal(doc.lastAutoTable.body[0].raw[0], data[0].funcionario);
            assert.equal(doc.lastAutoTable.body[1].raw[0], data[1].funcionario);
        }
        if (process.env.EXPORT_TEST_OUTPUT_DIR) {
            fs.mkdirSync(process.env.EXPORT_TEST_OUTPUT_DIR, { recursive: true });
            fs.writeFileSync(path.join(process.env.EXPORT_TEST_OUTPUT_DIR, `${mode}.pdf`), bytes);
        }
    });
}
for (const input of [null, { user: { role: 'CLIENT' } }, { user: { role: 'ADMIN' } }]) {
    test(`manual report authorization: ${input?.user.role || 'anonymous'}`, async () => {
        let reads = 0, sends = 0;
        const api = load('../src/app/api/reports/monthly/route.ts', {
            '@/auth': { auth: async () => input },
            '@/lib/db': { prisma: { user: { findMany: async () => { reads++; return []; }, findFirst: async () => null } } },
            resend: { Resend: class { emails = { send: async () => { sends++; } }; } },
            '@/lib/api-server': {}, '@/lib/schedules': {},
            jspdf: { default: jsPDF }, 'jspdf-autotable': { default: table },
        });
        const response = await api.GET(new Request('https://synthetic.invalid/api/reports/monthly?force=true'));
        assert.equal(response.status, input?.user.role === 'ADMIN' ? 200 : 401);
        assert.equal(reads, input?.user.role === 'ADMIN' ? 1 : 0);
        assert.equal(sends, 0);
    });
}
for (const [configured, bearer, expected] of [[undefined, 'Bearer undefined',401],['synthetic-secret','Bearer wrong',401],['synthetic-secret','Bearer synthetic-secret',200]]) {
    test(`cron authorization rejects missing/wrong secrets: expected ${expected}, ${bearer}`, async () => {
        let reads = 0;
        const api = load('../src/app/api/reports/monthly/route.ts', {
            '@/auth': { auth: async () => null },
            '@/lib/db': { prisma: { user: { findMany: async () => { reads++; return []; }, findFirst: async () => null } } },
            resend: { Resend: class {} }, '@/lib/api-server': {}, '@/lib/schedules': {},
            jspdf: { default: jsPDF }, 'jspdf-autotable': { default: table },
        }, { process: { env: { CRON_SECRET: configured } } });
        const response = await api.GET(new Request('https://synthetic.invalid/api/reports/monthly', { headers: { authorization: bearer } }));
        assert.equal(response.status, expected);
        assert.equal(reads, expected === 200 ? 1 : 0);
    });
}
test('monthly report uses replyTo and a real PDF attachment through a fake email transport only', async () => {
    const emails = [];
    const schedules = load('../src/lib/schedules.ts');
    const api = load('../src/app/api/reports/monthly/route.ts', {
        '@/auth': { auth: async () => ({ user: { role: 'ADMIN' } }) },
        '@/lib/db': { prisma: { user: { findMany: async () => [{ id:'synthetic',username:'synthetic',company:'Escola sintetica',vpEmail:'nobody@example.invalid',apiKey:'synthetic',apiSecret:'synthetic',apiUrl:'https://synthetic.invalid' }], findFirst: async () => null } } },
        '@/lib/api-server': { getCrossChexToken: async () => 'synthetic-token', generateRequestId: () => 'synthetic', generateTimestamp: () => 0 },
        '@/lib/schedules': schedules,
        resend: { Resend: class { emails = { send: async payload => { emails.push(payload); return { id:'not-sent' }; } }; } },
        jspdf: { default: jsPDF }, 'jspdf-autotable': { default: table },
    }, { process: { env: { RESEND_API_KEY:'synthetic-not-a-key' } }, fetch: async url => {
        assert.equal(url, 'https://synthetic.invalid');
        return { ok:true, json: async () => ({ payload:{ list:[0,1].map(checktype=>({ employee:{workno:'0908',first_name:'Synthetic',last_name:'Example'},checktype,checktime:`2026-10-27T${checktype ? '17':'08'}:00:00+00:00` })) } }) };
    } });
    const response = await api.GET(new Request('https://synthetic.invalid/api/reports/monthly?force=true'));
    assert.equal(response.status, 200);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].replyTo, 'comercial@techscire.pt');
    assert.equal('reply_to' in emails[0], false);
    assert.equal(emails[0].attachments[0].content.subarray(0,5).toString(), '%PDF-');
});
test('profile queries use a credential-free allowlist', async () => {
    let selection;
    const api = load('../src/app/api/user/profile/route.ts', {
        '@/auth': { auth: handler => handler },
        '@/lib/db': { prisma: { user: { findUnique: async args => { selection=args.select; return { id:'synthetic',username:'synthetic',company:'Synthetic' }; } } } },
        'next/server': { NextResponse: { json: (body,options={})=>({body,status:options.status||200}) } },
    });
    const result = await api.GET({ auth:{user:{id:'synthetic'}} });
    assert.equal(result.status, 200);
    for (const field of ['password','syncToken','apiSecret','apiKey']) assert.equal(field in selection, false);
    assert.equal('password' in result.body, false);
});
