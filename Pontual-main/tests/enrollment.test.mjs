import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { requireSuccess, processJob, runOnce, loadConfig } from '../school-agent/enrollment-agent.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadTs(path, extras = {}) {
    const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const context = { exports: {}, require, process: { env: {} }, AbortSignal, ...extras };
    vm.runInNewContext(source, context);
    return { api: context.exports, context };
}
const employee = { workno: '0908', name: 'Example', active: true, cardNumber: null, fingerprintTemplate: 'synthetic-test-template' };
const config = { cloudUrl: 'https://cloud.invalid', token: 'synthetic', biostarUrl: 'https://biostar.invalid',
    login: 'service', password: 'synthetic', terminals: ['1', '2'], userMap: { '0908': '908' }, accessGroups: ['7'], userGroup: '1' };
const job = { id: 'job', workno: '0908', terminalId: '1', revision: 'revision', leaseToken: 'lease', active: true, employee };
function transport({ failure, missing = false, stale = false } = {}) {
    const calls = [];
    const call = async (url, options = {}) => {
        calls.push({ url, ...options });
        if (url.endsWith('/api/sync/enrollments')) {
            if (options.method === 'PATCH') return { status: stale ? 409 : 200, body: { valid: !stale } };
            if (options.method === 'POST') return { status: 200, body: { accepted: true } };
            return { status: 200, body: { jobs: [job] } };
        }
        const operation = url.endsWith('/api/login') ? 'LOGIN'
            : url.includes('/export?') ? 'EXPORT' : options.method === 'PUT' ? 'UPDATE'
            : url.endsWith('/api/users') ? 'CREATE' : 'READ';
        if (operation === failure) return { status: 200, body: { Response: { code: '999' } } };
        if (operation === 'READ' && missing && !url.endsWith('/api/logout')) return { status: 404 };
        return { status: 200, headers: new Headers({ 'bs-session-id': 'session' }),
            body: { Response: { code: '0' }, User: { user_id: '908', name: 'Example' } } };
    };
    return { calls, call };
}

test('HTTP 200 with vendor failure is rejected', () => {
    assert.throws(() => requireSuccess({ status: 200, body: { Response: { code: '1' } } }, 'EXPORT'));
    assert.throws(() => requireSuccess({ status: 200, body: {} }, 'EXPORT'));
});
test('each task exports only to its own terminal', async () => {
    const t = transport();
    assert.equal(await processJob(config, job, t.call), 'EXPORTED');
    const exportCall = t.calls.find(c => c.url.includes('/export?'));
    assert.deepEqual(exportCall.body.DeviceCollection.rows, [{ id: '1' }]);
});
for (const stage of ['LOGIN', 'UPDATE', 'EXPORT', 'CREATE']) {
    test(`${stage} failure never yields EXPORTED receipt`, async () => {
        const t = transport({ failure: stage, missing: stage === 'CREATE' });
        await runOnce(config, t.call);
        const receipt = t.calls.find(c => c.url.endsWith('/api/sync/enrollments') && c.method === 'POST');
        assert.equal(receipt.body.status, 'ERROR');
        if (stage === 'UPDATE') assert.equal(t.calls.some(c => c.url.includes('/export?')), false);
    });
}
test('stale lease prevents writes', async () => {
    const t = transport({ stale: true });
    await assert.rejects(processJob(config, job, t.call), /STALE_LEASE/);
    assert.equal(t.calls.some(c => c.method === 'PUT'), false);
});
test('unconfigured terminal and unmapped ID are rejected before vendor calls', async () => {
    const t = transport();
    await assert.rejects(processJob(config, { ...job, terminalId: '99' }, t.call));
    await assert.rejects(processJob({ ...config, userMap: {} }, job, t.call));
    assert.equal(t.calls.length, 0);
});
test('deactivation sends disabled and exports without deleting BioStar user', async () => {
    const t = transport();
    await processJob(config, { ...job, active: false, employee: null }, t.call);
    assert.deepEqual(t.calls.find(c => c.method === 'PUT').body, { User: { disabled: true } });
    assert.equal(t.calls.some(c => c.method === 'DELETE'), false);
});
test('removing a fingerprint clears the remote template list', async () => {
    const t = transport();
    await processJob(config, { ...job, clearFingerprint: true, employee: { ...employee, fingerprintTemplate: null } }, t.call);
    assert.deepEqual(t.calls.find(c => c.method === 'PUT').body.User.fingerprint_templates, []);
});

test('missing cloud biometrics on imported employees never erases existing credentials', async () => {
    const t = transport();
    await processJob(config, { ...job, employee: { ...employee, fingerprintTemplate: null } }, t.call);
    assert.equal('fingerprint_templates' in t.calls.find(c => c.method === 'PUT').body.User, false);
});
test('creating users requires configured access groups and never assigns administrator permission', async () => {
    const t = transport({ missing: true });
    await processJob(config, job, t.call);
    const user = t.calls.find(c => c.url.endsWith('/api/users')).body.User;
    assert.equal(user.permission, undefined);
    assert.deepEqual(user.access_groups, [{ id: '7' }]);
    await assert.rejects(processJob({ ...config, accessGroups: [] }, job, transport({ missing: true }).call), /ACCESS_GROUPS_REQUIRED/);
});
test('configuration rejects HTTP endpoints', () => {
    assert.throws(() => loadConfig({ PONTUAL_SCHOOL_TOKEN: 'synthetic', BIOSTAR_URL: 'http://host', BIOSTAR_LOGIN: 'u', BIOSTAR_PASSWORD: 'p', BIOSTAR_TERMINAL_IDS: '1' }), /HTTPS_REQUIRED/);
});

test('queue does nothing for unconfigured schools', async () => {
    const { api } = loadTs('../src/lib/enrollment-sync.ts');
    await api.enqueueEnrollment({}, 'school', employee);
});
test('queue detects changes beyond the old template prefix, and preserves active leases', async () => {
    const { api } = loadTs('../src/lib/enrollment-sync.ts', { process: { env: { ENROLLMENT_SYNC_USER_ID: 'school', ENROLLMENT_TERMINAL_IDS: '1,2' } } });
    const writes = [];
    const tx = { enrollmentTask: {
        findUnique: async () => null,
        upsert: async args => { writes.push(args); },
    } };
    await api.enqueueEnrollment(tx, 'school', { ...employee, fingerprintTemplate: 'a'.repeat(40) + '1' });
    const revision = writes[0].create.revision;
    assert.equal(writes.length, 2);
    writes.length = 0;
    tx.enrollmentTask.findUnique = async () => ({ revision, status: 'PROCESSING', leaseToken: 'old', leaseExpiresAt: new Date(Date.now() + 60000) });
    await api.enqueueEnrollment(tx, 'school', { ...employee, fingerprintTemplate: 'a'.repeat(40) + '2' });
    assert.notEqual(writes[0].update.revision, revision);
    assert.equal(writes[0].update.status, 'PROCESSING');
    assert.equal(writes[0].update.leaseToken, 'old');
});
test('unchanged desired state does not duplicate exports', async () => {
    const { api } = loadTs('../src/lib/enrollment-sync.ts', { process: { env: { ENROLLMENT_SYNC_USER_ID: 'school', ENROLLMENT_TERMINAL_IDS: '1' } } });
    let saved;
    const tx = { enrollmentTask: { findUnique: async () => saved, upsert: async args => { saved = args.create; } } };
    await api.enqueueEnrollment(tx, 'school', employee);
    tx.enrollmentTask.upsert = async () => assert.fail('duplicate');
    await api.enqueueEnrollment(tx, 'school', employee);
});
test('USB discovery supports reversed ports', async () => {
    const { api } = loadTs('../src/lib/usb-scanner.ts', { fetch: async url => {
        if (!url.startsWith('http://localhost:8081/')) throw new Error('empty response');
        return { ok: true, json: async () => ({ Devices: [{ name: 'BioMini Plus2', fingerprint: 'true' }] }) };
    } });
    assert.equal((await api.findUsbScanner()).url, 'http://localhost:8081');
});
test('USB discovery distinguishes no reader from unreachable agent', async () => {
    const { api } = loadTs('../src/lib/usb-scanner.ts', { fetch: async () => ({ ok: true, json: async () => ({ Devices: '' }) }) });
    await assert.rejects(api.findUsbScanner(), /não deteta o leitor/);
});
test('USB capture rejects retcode 0 and never invents quality', async () => {
    let payload = { retcode: 0 };
    const { api } = loadTs('../src/lib/usb-scanner.ts', { fetch: async (_, options) => {
        assert.equal(options.headers['Content-Type'], 'text/plain;charset=UTF-8');
        return { ok: true, json: async () => payload };
    } });
    await assert.rejects(api.captureUsbFingerprint({ url: 'http://localhost:8082' }), /código 0/);
    payload = { template: 'synthetic', score: 0 };
    assert.equal((await api.captureUsbFingerprint({ url: 'http://localhost:8082' })).quality, 0);
    payload = { template: 'synthetic' };
    assert.equal((await api.captureUsbFingerprint({ url: 'http://localhost:8082' })).quality, null);
});

function queueRoutes(db) {
    return loadTs('../src/app/api/sync/enrollments/route.ts', { require: name => {
        if (name === '@/lib/db') return { prisma: db };
        if (name === '@/lib/enrollment-sync') return { enrollmentTerminals: id => id === 'school' ? ['1'] : [] };
        if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
        return require(name);
    } }).api;
}
const authenticated = body => ({ headers: new Headers({ 'x-school-token': 'synthetic' }), json: async () => body });
test('queue refuses unauthenticated access before reading tasks', async () => {
    const routes = queueRoutes({ user: { findUnique: async () => null } });
    assert.equal((await routes.GET(authenticated())).status, 401);
});
test('queue lease claim uses school, revision and eligibility atomically', async () => {
    let where;
    const routes = queueRoutes({ user: { findUnique: async () => ({ id: 'school' }) },
        enrollmentAgent: { upsert: async () => {} },
        enrollmentTask: {
            findMany: async () => [{ id: 't', workno: '0908', terminalId: '1', revision: 'r', active: true }],
            updateMany: async args => { where = args.where; return { count: 0 }; },
        },
    });
    const result = await routes.GET(authenticated());
    assert.equal(where.userId, 'school');
    assert.equal(where.revision, 'r');
    assert.equal(where.OR.length, 2);
    assert.equal(result.body.jobs.length, 0);
});
test('receipt is fenced by school, revision, token and unexpired lease', async () => {
    let update;
    const routes = queueRoutes({ user: { findUnique: async () => ({ id: 'school' }) },
        enrollmentTask: {
            findFirst: async args => { assert.equal(args.where.userId, 'school'); return { id: 't', attempts: 3 }; },
            updateMany: async args => { update = args; return { count: 0 }; },
        },
    });
    const result = await routes.POST(authenticated({ id: 't', revision: 'old', leaseToken: 'old', status: 'EXPORTED' }));
    assert.equal(result.status, 409);
    assert.equal(update.where.userId, 'school');
    assert.equal(update.where.revision, 'old');
    assert.equal(update.where.leaseToken, 'old');
    assert.equal(update.where.status, 'PROCESSING');
    assert.ok(update.where.leaseExpiresAt.gt);
});
test('error receipts schedule retry without storing vendor-provided secrets', async () => {
    let update;
    const routes = queueRoutes({ user: { findUnique: async () => ({ id: 'school' }) },
        enrollmentTask: { findFirst: async () => ({ id: 't', attempts: 2 }),
            updateMany: async args => { update = args; return { count: 1 }; } },
    });
    const result = await routes.POST(authenticated({ id: 't', revision: 'r', leaseToken: 'l', status: 'ERROR', error: 'synthetic-secret' }));
    assert.equal(result.status, 200);
    assert.ok(update.data.nextAttemptAt.getTime() > Date.now());
    assert.equal(update.data.lastError.includes('synthetic-secret'), false);
});
test('deletion queues a tombstone and waits for any active lease', async () => {
    const { api } = loadTs('../src/lib/enrollment-sync.ts', { process: { env: { ENROLLMENT_SYNC_USER_ID: 'school', ENROLLMENT_TERMINAL_IDS: '1' } } });
    let update;
    await api.enqueueRemoval({ enrollmentTask: {
        findUnique: async () => ({ status: 'PROCESSING', leaseToken: 'lease', leaseExpiresAt: new Date(Date.now() + 60000) }),
        upsert: async args => { update = args.update; },
    } }, 'school', '0908');
    assert.equal(update.active, false);
    assert.equal(update.status, 'PROCESSING');
    assert.equal(update.leaseToken, 'lease');
});
