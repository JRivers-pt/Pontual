import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { requireSuccess, processJob, runOnce, loadConfig } from '../school-agent/enrollment-agent.mjs';
import { encodeFingerprintPair, decodeFingerprintPair } from '../school-agent/fingerprint-format.mjs';
import { matchesCertificatePin, pinnedBioStarRequest } from '../school-agent/pinned-transport.mjs';
import { createHash, X509Certificate } from 'node:crypto';
import https from 'node:https';
import { once } from 'node:events';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadTs(path, extras = {}) {
    const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const context = { exports: {}, require, process: { env: {} }, AbortSignal, URLSearchParams, ...extras };
    vm.runInNewContext(source, context);
    return { api: context.exports, context };
}
const employee = { workno: '0908', name: 'Example', active: true, cardNumber: null, fingerprintTemplate: encodeFingerprintPair('synthetic-first', 'synthetic-second') };
const config = { cloudUrl: 'https://cloud.invalid', token: 'synthetic', biostarUrl: 'https://biostar.invalid',
    login: 'service', password: 'synthetic', terminals: ['1', '2'], userMap: { '0908': '908' }, accessGroups: ['7'], userGroup: '1' };
const job = { id: 'job', workno: '0908', terminalId: '1', revision: 'revision', leaseToken: 'lease', remoteUserId: '908', active: true, employee };
function transport({ failure, missing = false, stale = false, missingCode = 404, protectedAccount = false, deviceFailure = false } = {}) {
    const calls = [];
    let exists = !missing, disabled = 'false', fingerprintCount = 1;
    const call = async (url, options = {}) => {
        calls.push({ url, ...options });
        if (url.endsWith('/api/sync/enrollments')) {
            if (options.method === 'PATCH') return { status: stale ? 409 : 200, body: { valid: !stale } };
            if (options.method === 'POST') return { status: 200, body: { accepted: true } };
            return { status: 200, body: { jobs: [job] } };
        }
        const operation = url.endsWith('/api/login') ? 'LOGIN'
            : url.includes('/export?') ? 'EXPORT' : options.method === 'PUT' ? 'UPDATE'
            : url.endsWith('/api/users') ? 'CREATE' : url.includes('/api/devices/') ? 'READ_DEVICE' : 'READ';
        if (operation === failure) return { status: 200, body: { Response: { code: '999' } } };
        if (operation === 'READ' && !exists && !url.endsWith('/api/logout')) return { status: missingCode, body: { Response: { code: '201' } } };
        if (operation === 'CREATE') exists = true;
        if (operation === 'UPDATE') {
            disabled = options.body.User.disabled;
            if (options.body.User.fingerprint_templates) fingerprintCount = options.body.User.fingerprint_templates.length;
        }
        if (operation === 'EXPORT' && deviceFailure) return { status: 200, body: { Response: { code: '0' }, DeviceResponse: { result: 'false', rows: [{ id: '1', code: '500' }] } } };
        return { status: 200, headers: new Headers({ 'bs-session-id': 'session' }),
            body: { Response: { code: '0' }, User: { user_id: '908', name: 'Example', updated_count: '2', ...(protectedAccount ? { login_id: 'admin', permission: { id: '1' } } : {}) },
                ...(operation === 'READ_DEVICE' ? { UserCollection: { total: '1', rows: [{ user_id: '908', updated_count: '2', disabled, fingerprint_templates_count: fingerprintCount }] } } : {}) } };
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
    await assert.rejects(processJob({ ...config, userMap: {} }, { ...job, remoteUserId: null }, t.call));
    assert.equal(t.calls.length, 0);
});
test('deactivation sends disabled and exports without deleting BioStar user', async () => {
    const t = transport();
    await processJob(config, { ...job, active: false, employee: null }, t.call);
    assert.deepEqual(t.calls.find(c => c.method === 'PUT').body, { User: { disabled: 'true' } });
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
    const { api } = loadTs('../src/lib/usb-scanner.ts', { fetch: async (url, options) => {
        assert.equal(options.method, 'GET');
        assert.ok(url.includes('/api/ScanBiomini?'));
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

test('native BioStar 400/201 means absent user and permits creation', async () => {
    const t = transport({ missing: true, missingCode: 400 });
    assert.equal(await processJob(config, { ...job }, t.call), 'EXPORTED');
    assert.ok(t.calls.some(c => c.url.endsWith('/api/users') && c.method === 'POST'));
});
test('administrative BioStar users are protected even when IDs are mapped', async () => {
    const t = transport({ protectedAccount: true });
    await assert.rejects(processJob(config, { ...job }, t.call), /PROTECTED_ACCOUNT/);
    assert.equal(t.calls.some(c => c.method === 'PUT' || c.url.includes('/export?')), false);
});
test('legacy device users require reconciliation before any credential changes', async () => {
    const t = transport();
    await assert.rejects(processJob(config, { ...job, remoteUserId: null }, t.call), /LEGACY_USER_IMPORT_REQUIRED/);
    assert.equal(t.calls.some(c => c.method === 'PUT' || c.url.includes('/export?')), false);
});
test('HTTP 200 with failed DeviceResponse never counts as exported', async () => {
    const t = transport({ deviceFailure: true });
    await assert.rejects(processJob(config, { ...job }, t.call), /DEVICE_FAILURE/);
});
test('legacy single-sample templates require recapture rather than fabricating a second sample', async () => {
    assert.throws(() => decodeFingerprintPair('legacy-single-sample'), /FINGERPRINT_PAIR_REQUIRED/);
    const pair = decodeFingerprintPair(encodeFingerprintPair('first', 'second'));
    assert.equal(pair.template0, 'first');
    assert.equal(pair.template1, 'second');
});
test('USB verification follows native form protocol and preserves base64 characters', async () => {
    let result = 1;
    const { api } = loadTs('../src/lib/usb-scanner.ts', { fetch: async (url, options) => {
        assert.equal(url, 'http://localhost:8082/api/Verify');
        assert.equal(options.method, 'POST');
        assert.match(options.headers['Content-Type'], /^application\/x-www-form-urlencoded/);
        const fields = new URLSearchParams(String(options.body));
        assert.equal(fields.get('template1'), 'first+==');
        assert.equal(fields.get('template2'), 'second/==');
        return { ok: true, json: async () => ({ retcode: result }) };
    } });
    await api.verifyUsbFingerprintPair({ url: 'http://localhost:8082' }, 'first+==', 'second/==');
    result = 0;
    await assert.rejects(api.verifyUsbFingerprintPair({ url: 'http://localhost:8082' }, 'first+==', 'second/=='), /mesmo dedo/);
});
test('new remote IDs resolve to employee numbers without modifying legacy mappings', () => {
    const { api } = loadTs('../src/lib/sync-identity.ts');
    const map = api.remoteIdentityMap([{ remoteUserId: '1000908', workno: '0908' }, { remoteUserId: '1000908', workno: '0908' }]);
    assert.equal(map.get('1000908'), '0908');
    assert.equal(map.has('0700'), false);
    assert.throws(() => api.remoteIdentityMap([{ remoteUserId: '1000908', workno: '0908' }, { remoteUserId: '1000908', workno: '0909' }]), /Conflicting/);
});
test('certificate pin is exact and malformed pins are rejected', () => {
    const raw = Buffer.from('synthetic certificate');
    const pin = createHash('sha256').update(raw).digest('hex');
    assert.equal(matchesCertificatePin(raw, pin), true);
    assert.equal(matchesCertificatePin(Buffer.from('other certificate'), pin), false);
    assert.equal(matchesCertificatePin(raw, 'not-a-pin'), false);
});

test('pinned TLS releases credentials only to the matching certificate', { skip: !process.env.TLS_TEST_FIXTURE_DIR }, async () => {
    let requests = 0;
    const cert = fs.readFileSync(path.join(process.env.TLS_TEST_FIXTURE_DIR, 'cert.pem'));
    const key = fs.readFileSync(path.join(process.env.TLS_TEST_FIXTURE_DIR, 'key.pem'));
    const server = https.createServer({ cert, key }, (req, res) => {
        requests++;
        req.resume();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"Response":{"code":"0"}}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `https://127.0.0.1:${server.address().port}`;
    const pin = createHash('sha256').update(new X509Certificate(cert).raw).digest('hex');
    try {
        const result = await pinnedBioStarRequest(origin, pin)(`${origin}/login`, { method: 'POST', body: { password: 'synthetic' } });
        assert.equal(result.status, 200);
        assert.equal(requests, 1);
        await assert.rejects(pinnedBioStarRequest(origin, '0'.repeat(64))(`${origin}/login`, { method: 'POST', body: { password: 'synthetic' } }), /CERTIFICATE_PIN_MISMATCH/);
        assert.equal(requests, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('an accepted export without the expected terminal record is rejected', async () => {
    const t = transport();
    const call = async (url, options) => {
        const result = await t.call(url, options);
        if (url.includes('/api/devices/')) result.body.UserCollection = { total: 0, rows: [] };
        return result;
    };
    await assert.rejects(processJob(config, { ...job }, call), /DEVICE_READBACK_FAILED/);
});
test('new identity is bound before export so the attendance daemon can resolve it immediately', async () => {
    const t = transport({ missing: true, missingCode: 400 });
    await processJob(config, { ...job, resolvedUserId: undefined }, t.call);
    const exportIndex = t.calls.findIndex(c => c.url.includes('/export?'));
    assert.ok(t.calls.slice(0, exportIndex).some(c => c.method === 'PATCH' && c.body.remoteUserId === '908'));
});
test('empty access groups require an explicit validated policy', async () => {
    const t = transport({ missing: true, missingCode: 400 });
    await processJob({ ...config, accessGroups: [], allowNoAccessGroups: true }, { ...job }, t.call);
    const user = t.calls.find(c => c.url.endsWith('/api/users')).body.User;
    assert.equal('access_groups' in user, false);
    assert.equal('permission' in user, false);
});
