import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { requireSuccess, processJob, runOnce, loadConfig } from '../school-agent/enrollment-agent.mjs';
import * as fingerprintFormat from '../school-agent/fingerprint-format.mjs';
const { encodeFingerprintPair, decodeFingerprintPair } = fingerprintFormat;
import { matchesCertificatePin, pinnedBioStarRequest } from '../school-agent/pinned-transport.mjs';
import { createHash, X509Certificate } from 'node:crypto';
import https from 'node:https';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadTs(path, extras = {}) {
    const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const context = { exports: {}, require: name => name === '@/lib/fingerprint-format' ? fingerprintFormat : require(name), process: { env: {} }, AbortSignal, URLSearchParams, Error, ...extras };
    vm.runInNewContext(source, context);
    return { api: context.exports, context };
}
const employee = { workno: '0908', name: 'Example', active: true, cardNumber: null, fingerprintTemplate: encodeFingerprintPair('synthetic-first', 'synthetic-second') };
const config = { cloudUrl: 'https://cloud.invalid', token: 'synthetic', biostarUrl: 'https://biostar.invalid',
    login: 'service', password: 'synthetic', terminals: ['1', '2'], userMap: { '0908': '908' }, accessGroups: ['7'], userGroup: '1' };
const job = { id: 'job', workno: '0908', terminalId: '1', revision: 'revision', leaseToken: 'lease', remoteUserId: '908', managementTag: 'PTL-' + 'a'.repeat(24), active: true, employee };
function transport({ failure, missing = false, stale = false, missingCode = 404, protectedAccount = false, deviceFailure = false, devicePresent = !missing } = {}) {
    const calls = [];
    let exists = !missing, disabled = 'false', fingerprintCount = 1, name = 'Example', uid = '908', version = 2;
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
        if (operation === 'READ' && !exists && !url.endsWith('/api/logout') && !url.endsWith('/api/v2/fingerprintFormat')) return { status: missingCode, body: { Response: { code: '201' } } };
        if (operation === 'CREATE') {
            assert.ok(Number.isFinite(Date.parse(options.body.User.start_datetime)), 'Installed BioStar requires an explicit validity start');
            assert.ok(Number.isFinite(Date.parse(options.body.User.expiry_datetime)), 'Installed BioStar requires an explicit expiry');
            exists = true; name = options.body.User.name; disabled = options.body.User.disabled; uid = options.body.User.user_id;
        }
        if (operation === 'UPDATE') {
            disabled = options.body.User.disabled;
            name = options.body.User.name || name;
            version++;
            if (options.body.User.fingerprint_templates) fingerprintCount = options.body.User.fingerprint_templates.length;
        }
        if (operation === 'EXPORT') devicePresent = true;
        if (operation === 'EXPORT' && deviceFailure) return { status: 200, body: { Response: { code: '0' }, DeviceResponse: { result: 'false', rows: [{ id: '1', code: '500' }] } } };
        return { status: 200, headers: new Headers({ 'bs-session-id': 'session' }),
            body: { Response: { code: '0' }, Setting: { fingerprint_format: '0' }, User: { user_id: uid, name, disabled, updated_count: String(version), ...(protectedAccount ? { login_id: 'admin', permission: { id: '1' } } : {}) },
                ...(operation === 'READ_DEVICE' ? { UserCollection: { total: devicePresent ? '1' : '0', rows: devicePresent ? [{ user_id: uid, updated_count: String(version), disabled, fingerprint_templates_count: fingerprintCount }] : [] } } : {}) } };
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
    assert.equal(user.start_datetime, '2001-01-01T00:00:00.00Z');
    assert.equal(user.expiry_datetime, '2037-12-31T23:59:59.00Z');
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
    const tx = { $queryRaw: async () => [], enrollmentTask: {
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
    const tx = { $queryRaw: async () => [], enrollmentTask: { findUnique: async () => saved, upsert: async args => { saved = args.create; } } };
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
        assert.equal(new URL(url).searchParams.get('template_type'), '2001');
        return { ok: true, json: async () => payload };
    } });
    await assert.rejects(api.captureUsbFingerprint({ url: 'http://localhost:8082' }), /código 0/);
    payload = { template: 'synthetic', score: 0 };
    assert.equal((await api.captureUsbFingerprint({ url: 'http://localhost:8082' })).quality, 0);
    payload = { template: 'synthetic' };
    assert.equal((await api.captureUsbFingerprint({ url: 'http://localhost:8082' })).quality, null);
});

function queueRoutes(db) {
    db.$transaction ||= async fn => fn(db);
    if (db.enrollmentTask) db.enrollmentTask.findFirst ||= async () => null;
    return loadTs('../src/app/api/sync/enrollments/route.ts', { require: name => {
        if (name === '@/lib/db') return { prisma: db };
        if (name === '@/lib/enrollment-sync') return { enrollmentTerminals: id => id === 'school' ? ['1'] : [], lockEnrollment: async () => {}, bindRemoteIdentity: async () => {} };
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
    await api.enqueueRemoval({ $queryRaw: async () => [], enrollmentTask: {
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

test('USB Suprema uses 2001 and rejects envelopes captured with the server format code', () => {
    const pair = JSON.parse(encodeFingerprintPair('first', 'second'));
    assert.equal(pair.templateType, 2001);
    assert.throws(() => decodeFingerprintPair(JSON.stringify({ ...pair, templateType: 0 })), /FINGERPRINT_PAIR_REQUIRED/);
});

test('an incompatible BioStar fingerprint format prevents all credential writes', async () => {
    const t = transport();
    const call = async (url, options) => {
        const result = await t.call(url, options);
        if (url.endsWith('/api/v2/fingerprintFormat')) result.body.Setting.fingerprint_format = '1';
        return result;
    };
    await assert.rejects(processJob(config, { ...job }, call), /TEMPLATE_FORMAT_MISMATCH/);
    assert.equal(t.calls.some(c => c.method === 'PUT' || c.url.includes('/export?') || c.url.endsWith('/api/users')), false);
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
        assert.equal(fields.get('template_type'), '2001');
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

test('pinned TLS releases credentials only to the matching certificate', async () => {
    let requests = 0;
    const fixtureDir = process.env.TLS_TEST_FIXTURE_DIR || fileURLToPath(new URL('./fixtures/tls/', import.meta.url));
    const cert = fs.readFileSync(path.join(fixtureDir, 'cert.pem'));
    const key = fs.readFileSync(path.join(fixtureDir, 'key.pem'));
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

test('a lost create response is recovered from our disabled placeholder without duplicate creation', async () => {
    const t = transport({ missing: true, missingCode: 400 });
    let loseResponse = true;
    const call = async (url, options) => {
        const result = await t.call(url, options);
        if (url.endsWith('/api/users') && options?.method === 'POST' && loseResponse) {
            loseResponse = false;
            throw new Error('SYNTHETIC_TIMEOUT_AFTER_COMMIT');
        }
        return result;
    };
    await assert.rejects(processJob(config, { ...job, remoteUserId: null }, call), /SYNTHETIC_TIMEOUT/);
    assert.equal(await processJob(config, { ...job, remoteUserId: null }, call), 'EXPORTED');
    const creates = t.calls.filter(c => c.url.endsWith('/api/users') && c.method === 'POST');
    assert.equal(creates.length, 1);
    assert.equal(creates[0].body.User.disabled, 'true');
    assert.equal(creates[0].body.User.name, job.managementTag);
});
test('an unrelated user with the exact same name is still a collision', async () => {
    const t = transport({ devicePresent: false });
    await assert.rejects(processJob(config, { ...job, remoteUserId: null }, t.call), /USER_ID_COLLISION/);
    assert.equal(t.calls.some(c => c.method === 'PUT' || c.url.includes('/export?')), false);
});
test('a missing device fingerprint count cannot be treated as successful capture distribution', async () => {
    const t = transport();
    const call = async (url, options) => {
        const result = await t.call(url, options);
        if (url.includes('/api/devices/')) delete result.body.UserCollection.rows[0].fingerprint_templates_count;
        return result;
    };
    await assert.rejects(processJob(config, { ...job }, call), /DEVICE_READBACK_FAILED/);
});
test('device paging follows the actual returned page size instead of skipping capped pages', async () => {
    const t = transport();
    const offsets = [];
    const call = async (url, options) => {
        const result = await t.call(url, options);
        if (url.includes('/api/devices/')) {
            const offset = Number(new URL(url).searchParams.get('offset')); offsets.push(offset);
            result.body.UserCollection = { total: '3', rows: offset < 2 ? [{ user_id: String(offset + 40) }]
                : [{ user_id: '908', disabled: 'false', updated_count: result.body.User.updated_count, fingerprint_templates_count: 1 }] };
        }
        return result;
    };
    assert.equal(await processJob(config, { ...job }, call), 'EXPORTED');
    assert.deepEqual(offsets, [0, 1, 2]);
});
for (const roster of [{ rows: [] }, { total: 'unknown', rows: [] }, { total: '5', rows: [] }]) {
    test(`an incomplete device inventory cannot prove revocation: ${JSON.stringify(roster)}`, async () => {
        const t = transport();
        const call = async (url, options) => {
            const result = await t.call(url, options);
            if (url.includes('/api/devices/')) result.body.UserCollection = roster;
            return result;
        };
        await assert.rejects(processJob(config, { ...job, active: false }, call), /DEVICE_READBACK_FAILED/);
    });
}
for (const [key, value] of [
    ['BIOSTAR_TERMINAL_IDS', '../users'], ['BIOSTAR_TERMINAL_IDS', '0'],
    ['BIOSTAR_NEW_USER_ID_OFFSET', 'NaN'], ['BIOSTAR_NEW_USER_ID_OFFSET', '-1'],
    ['BIOSTAR_USER_MAP_JSON', '[]'], ['BIOSTAR_USER_MAP_JSON', '{"0908":"-1"}'],
    ['BIOSTAR_TLS_PIN_SHA256', 'bad-pin'], ['PONTUAL_URL', 'https://user:password@example.invalid'],
    ['BIOSTAR_URL', 'https://example.invalid/unexpected-path'],
    ['BIOSTAR_NEW_USER_EXPIRY_DATETIME', '2000-01-01T00:00:00Z'],
    ['BIOSTAR_NEW_USER_START_DATETIME', '2099-01-01T00:00:00Z'],
    ['BIOSTAR_NEW_USER_START_DATETIME', 'not-a-date'],
]) {
    test(`configuration fails closed for invalid ${key}: ${value}`, () => {
        assert.throws(() => loadConfig({ PONTUAL_SCHOOL_TOKEN: 'synthetic', BIOSTAR_URL: 'https://host.invalid', BIOSTAR_LOGIN: 'u',
            BIOSTAR_PASSWORD: 'p', BIOSTAR_TERMINAL_IDS: '1', [key]: value }));
    });
}
for (const stage of ['LOGIN', 'READ', 'UPDATE', 'EXPORT', 'READ_DEVICE']) {
    test(`network loss at ${stage} produces an error receipt`, async () => {
        const t = transport();
        const call = async (url, options = {}) => {
            const matches = stage === 'LOGIN' ? url.endsWith('/api/login')
                : stage === 'READ' ? /\/api\/users\/\d+$/.test(url) && !options.method
                : stage === 'UPDATE' ? options.method === 'PUT'
                : stage === 'EXPORT' ? url.includes('/export?') : url.includes('/api/devices/');
            if (matches) throw new Error('SYNTHETIC_NETWORK_FAILURE');
            return t.call(url, options);
        };
        assert.equal((await runOnce(config, call)).failed, 1);
        assert.equal(t.calls.find(c => c.method === 'POST' && c.url.endsWith('/api/sync/enrollments')).body.status, 'ERROR');
    });
}
test('a non-Error transport rejection still produces a safe error receipt', async () => {
    const t = transport();
    const call = (url, options) => url.endsWith('/api/login') ? Promise.reject(null) : t.call(url, options);
    assert.equal((await runOnce(config, call)).failed, 1);
    assert.equal(t.calls.find(c => c.method === 'POST').body.errorCode, 'REQUEST_FAILED');
});
test('lost receipt response is surfaced instead of silently declaring delivery', async () => {
    const t = transport();
    const call = (url, options) => options?.method === 'POST' && url.endsWith('/api/sync/enrollments')
        ? Promise.resolve({ status: 503 }) : t.call(url, options);
    await assert.rejects(runOnce(config, call), /RECEIPT_FAILED/);
});

const statusCase = (statuses, extra = {}) => ({ enabled: true, online: true, terminalCount: 3, terminalIds: ['1','2','3'],
    tasks: statuses.map((status, index) => ({ workno: '0908', terminalId: String(index + 1), status })), ...extra });
for (const [name, state, pattern] of [
    ['unavailable', null, /indisponível/],
    ['disabled', statusCase([], { enabled: false }), /sem confirmação/],
    ['no receipts', statusCase([]), /sem envio confirmado/],
    ['partially complete', statusCase(['EXPORTED','PENDING','PENDING']), /pendente \(1\/3\)/],
    ['all accepted', statusCase(['EXPORTED','EXPORTED','EXPORTED']), /aceitou 3\/3/],
    ['central service offline', statusCase(['PENDING'], { online: false }), /aguardar serviço central/],
    ['visible actionable failure', statusCase([], { tasks: [{ workno:'0908',terminalId:'1',status:'ERROR',lastError:'Rever mapeamento.' }] }), /Rever mapeamento/],
    ['a foreign terminal cannot complete the required set', statusCase([], { tasks: ['1','2','99'].map(terminalId => ({ workno:'0908',terminalId,status:'EXPORTED' })) }), /pendente \(2\/3\)/],
]) {
    test(`status presentation: ${name}`, () => {
        const { api } = loadTs('../src/lib/enrollment-status.ts');
        assert.match(api.enrollmentStatusText(state, '0908'), pattern);
    });
}
