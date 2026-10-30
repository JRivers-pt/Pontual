import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decodeFingerprintPair } from './fingerprint-format.mjs';
import { pinnedBioStarRequest } from './pinned-transport.mjs';

// Defaults extracted from the installed BioStar 2 user-creation UI.
const DEFAULT_START_DATE = '2001-01-01T00:00:00.00Z';
const DEFAULT_EXPIRY_DATE = '2037-12-31T23:59:59.00Z';

export function requireSuccess(result, operation) {
    if (!result || result.status < 200 || result.status >= 300) throw new Error(`${operation}: HTTP_FAILURE`);
    if (!result.body?.Response || String(result.body.Response.code) !== '0') throw new Error(`${operation}: VENDOR_FAILURE`);
    const rows = result.body.DeviceCollection?.rows;
    if (Array.isArray(rows) && rows.some(row => row.status === 'ERROR' || Number(row.error_code || 0) !== 0)) {
        throw new Error(`${operation}: DEVICE_FAILURE`);
    }
    if (String(result.body.DeviceResponse?.result) === 'false' ||
        result.body.DeviceResponse?.rows?.some(row => String(row.code) !== '0')) throw new Error(`${operation}: DEVICE_FAILURE`);
    if (result.body.InProgressDeviceCollection?.rows?.length) throw new Error(`${operation}: DEVICE_PENDING`);
    return result.body;
}

export function loadConfig(env = process.env) {
    const config = {
        cloudUrl: env.PONTUAL_URL || 'https://www.pontualidade.pt',
        token: env.PONTUAL_SCHOOL_TOKEN, biostarUrl: env.BIOSTAR_URL,
        login: env.BIOSTAR_LOGIN, password: env.BIOSTAR_PASSWORD,
        terminals: (env.BIOSTAR_TERMINAL_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
        userMap: JSON.parse(env.BIOSTAR_USER_MAP_JSON || '{}'),
        allowNumericIds: env.BIOSTAR_ALLOW_NUMERIC_IDS === 'true',
        accessGroups: (env.BIOSTAR_ACCESS_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
        userGroup: env.BIOSTAR_USER_GROUP_ID || '1',
        allowNoAccessGroups: env.BIOSTAR_ALLOW_NO_ACCESS_GROUPS === 'true',
        newUserIdOffset: Number(env.BIOSTAR_NEW_USER_ID_OFFSET || 1000000),
        certificatePin: env.BIOSTAR_TLS_PIN_SHA256 || '',
        newUserStartDate: env.BIOSTAR_NEW_USER_START_DATETIME || DEFAULT_START_DATE,
        newUserExpiryDate: env.BIOSTAR_NEW_USER_EXPIRY_DATETIME || DEFAULT_EXPIRY_DATE,
    };
    if (!config.token || !config.biostarUrl || !config.login || !config.password || !config.terminals.length) {
        throw new Error('MISSING_CONFIGURATION');
    }
    if (new URL(config.cloudUrl).protocol !== 'https:' || new URL(config.biostarUrl).protocol !== 'https:') {
        throw new Error('HTTPS_REQUIRED');
    }
    for (const field of ['cloudUrl', 'biostarUrl']) {
        const url = new URL(config[field]);
        if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('INVALID_BASE_URL');
        config[field] = url.origin;
    }
    if (!Number.isSafeInteger(config.newUserIdOffset) || config.newUserIdOffset < 1000 || config.newUserIdOffset > 4294967295) throw new Error('INVALID_ID_OFFSET');
    if (config.terminals.some(id => !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 4294967295)) throw new Error('INVALID_TERMINAL_ID');
    config.terminals = [...new Set(config.terminals)];
    if (!config.userMap || typeof config.userMap !== 'object' || Array.isArray(config.userMap) || Object.values(config.userMap).some(id => !/^[1-9]\d{0,9}$/.test(String(id)) || Number(id) > 4294967295)) throw new Error('INVALID_USER_MAP');
    if (config.certificatePin && !/^[a-f0-9]{64}$/i.test(config.certificatePin.replace(/:/g, ''))) throw new Error('INVALID_CERTIFICATE_PIN');
    if (!Number.isFinite(Date.parse(config.newUserStartDate)) || !Number.isFinite(Date.parse(config.newUserExpiryDate)) ||
        Date.parse(config.newUserExpiryDate) <= Math.max(Date.parse(config.newUserStartDate), Date.now())) throw new Error('INVALID_VALIDITY_PERIOD');
    return config;
}

export async function request(url, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' });
    // Never log request/response bodies: these carry credentials and biometric data.
    const data = await response.json().catch(() => null);
    return { status: response.status, body: data, headers: response.headers };
}

export async function processJob(config, job, call = request) {
    if (!job || typeof job !== 'object' || typeof job.workno !== 'string' || typeof job.active !== 'boolean' ||
        (job.active && (typeof job.employee?.name !== 'string' || !job.employee.name.trim()))) throw new Error('INVALID_JOB');
    // A stale in-memory attempt must never leak its resolved identity into another attempt.
    delete job.resolvedUserId;
    if (!config.terminals.includes(job.terminalId)) throw new Error('UNCONFIGURED_TERMINAL');
    const explicitId = config.userMap[job.workno];
    const userId = job.remoteUserId || explicitId || (config.allowNumericIds && /^\d+$/.test(job.workno)
        ? String((config.newUserIdOffset ?? 1000000) + Number(job.workno)) : null);
    if (!userId || !/^\d+$/.test(String(userId))) throw new Error('USER_MAPPING_REQUIRED');
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1 || Number(userId) > 4294967295) throw new Error('USER_MAPPING_REQUIRED');
    if (job.active && !job.employee) throw new Error('EMPLOYEE_MISSING');
    const fingerprint = job.active && job.employee?.fingerprintTemplate ? decodeFingerprintPair(job.employee.fingerprintTemplate) : null;
    const cloudHeaders = { 'x-school-token': config.token };
    const fence = async () => {
        const result = await call(`${config.cloudUrl}/api/sync/enrollments`, {
            method: 'PATCH', headers: cloudHeaders, body: { id: job.id, revision: job.revision, leaseToken: job.leaseToken,
                ...(job.resolvedUserId ? { remoteUserId: job.resolvedUserId } : {}) },
        });
        if (result.status !== 200 || !result.body?.valid) throw new Error('STALE_LEASE');
    };
    const login = await call(`${config.biostarUrl}/api/login`, {
        method: 'POST', body: { User: { login_id: config.login, password: config.password } },
    });
    requireSuccess(login, 'LOGIN');
    const sessionId = login.headers?.get('bs-session-id');
    if (!sessionId) throw new Error('SESSION_MISSING');
    const headers = { 'bs-session-id': sessionId };
    const deviceUser = async () => {
        let found, offset = 0, total = 1;
        while (!found && offset < total && offset < 2000) {
            const response = requireSuccess(await call(`${config.biostarUrl}/api/devices/${job.terminalId}/users?limit=200&offset=${offset}`, { headers }), 'READ_DEVICE');
            total = Number(response.UserCollection?.total);
            if (!response.UserCollection || !Array.isArray(response.UserCollection.rows) || !Number.isSafeInteger(total) || total < 0 ||
                (response.UserCollection.rows.length === 0 && offset < total)) throw new Error('DEVICE_READBACK_FAILED');
            found = response.UserCollection.rows.find(user => String(user.user_id) === String(userId));
            offset += response.UserCollection.rows.length;
        }
        if (!found && offset < total) throw new Error('DEVICE_ROSTER_LIMIT');
        return found;
    };
    try {
        if (fingerprint) {
            const setting = requireSuccess(await call(`${config.biostarUrl}/api/v2/fingerprintFormat`, { headers }), 'READ_FORMAT').Setting;
            if (String(setting?.fingerprint_format) !== '0') throw new Error('TEMPLATE_FORMAT_MISMATCH');
        }
        // Existing device credentials are a separate second-phase migration, never replace them blindly.
        if (explicitId && !job.remoteUserId && await deviceUser()) throw new Error('LEGACY_USER_IMPORT_REQUIRED');
        const url = `${config.biostarUrl}/api/users/${encodeURIComponent(userId)}`;
        const existing = await call(url, { headers });
        let exists = false;
        if (existing.status === 200) {
            const body = requireSuccess(existing, 'READ_USER');
            exists = String(body.User?.user_id) === String(userId);
            if (!exists) throw new Error('USER_RESPONSE_INVALID');
            if (body.User.login_id || String(body.User.permission?.id) === '1') throw new Error('PROTECTED_ACCOUNT');
            // A matching name alone does not establish ownership. Recover only our disabled placeholder
            // after a lost create response; confirmed cloud bindings survive normal edits and renames.
            if (!job.remoteUserId && (body.User.name !== job.managementTag || String(body.User.disabled) !== 'true')) throw new Error('USER_ID_COLLISION');
        } else if (existing.status !== 404 && !(existing.status === 400 && String(existing.body?.Response?.code) === '201')) {
            throw new Error('READ_USER_FAILED');
        }

        await fence();
        if (exists) job.resolvedUserId = String(userId);
        if (!exists && job.active) {
            if (!/^PTL-[a-f0-9]{24}$/.test(job.managementTag || '')) throw new Error('INVALID_MANAGEMENT_TAG');
            if (!config.accessGroups.length && !config.allowNoAccessGroups) throw new Error('ACCESS_GROUPS_REQUIRED');
            requireSuccess(await call(`${config.biostarUrl}/api/users`, { method: 'POST', headers,
                body: { User: { user_id: String(userId), name: job.managementTag,
                    user_group_id: { id: config.userGroup },
                    ...(config.accessGroups.length ? { access_groups: config.accessGroups.map(id => ({ id })) } : {}),
                    start_datetime: config.newUserStartDate || DEFAULT_START_DATE,
                    expiry_datetime: config.newUserExpiryDate || DEFAULT_EXPIRY_DATE,
                    disabled: 'true' } } }), 'CREATE_USER');
            const created = requireSuccess(await call(url, { headers }), 'READ_CREATED_USER').User;
            if (String(created?.user_id) !== String(userId) || created.name !== job.managementTag || String(created.disabled) !== 'true' || created.login_id || String(created.permission?.id) === '1') {
                throw new Error('USER_ID_COLLISION');
            }
            exists = true;
            job.resolvedUserId = String(userId);
        }
        if (!exists && !job.active && await deviceUser()) throw new Error('LEGACY_USER_IMPORT_REQUIRED');
        if (exists) {
            await fence();
            const User = job.active ? { name: job.employee.name, disabled: 'false',
                ...(fingerprint ? { fingerprint_templates: [fingerprint] }
                    : job.clearFingerprint ? { fingerprint_templates: [] } : {}) }
                : { disabled: 'true' };
            // An explicit removal clears old templates rather than leaving a stale credential active.
            requireSuccess(await call(url, { method: 'PUT', headers, body: { User } }), 'UPDATE_USER');
            const updatedUser = requireSuccess(await call(url, { headers }), 'READ_USER').User;
            if (!/^\d+$/.test(String(updatedUser?.updated_count))) throw new Error('USER_RESPONSE_INVALID');
            await fence();
            requireSuccess(await call(`${config.biostarUrl}/api/users/export?overwrite=true&id=${encodeURIComponent(userId)}`, {
                method: 'POST', headers, body: { DeviceCollection: { rows: [{ id: job.terminalId }] } },
            }), 'EXPORT_USER');
            // This route is verified against the installed BioStar UI and real W2 devices.
            const actual = await deviceUser();
            if (job.active) {
                if (!actual || String(actual.disabled) !== 'false') throw new Error('DEVICE_READBACK_FAILED');
                if (String(actual.updated_count) !== String(updatedUser.updated_count)) throw new Error('DEVICE_READBACK_FAILED');
                if (fingerprint && (!Number.isSafeInteger(Number(actual.fingerprint_templates_count)) || Number(actual.fingerprint_templates_count) < 1)) throw new Error('DEVICE_READBACK_FAILED');
                if (job.clearFingerprint && Number(actual.fingerprint_templates_count) !== 0) throw new Error('DEVICE_READBACK_FAILED');
            } else if (actual && (String(actual.disabled) !== 'true' || String(actual.updated_count) !== String(updatedUser.updated_count))) throw new Error('DEVICE_READBACK_FAILED');
        }
        // EXPORTED means BioStar accepted the operation, never proof of a physical passage.
        return 'EXPORTED';
    } finally {
        await call(`${config.biostarUrl}/api/logout`, { method: 'POST', headers }).catch(() => {});
    }
}

export async function runOnce(config, call = request) {
    const headers = { 'x-school-token': config.token };
    const response = await call(`${config.cloudUrl}/api/sync/enrollments`, { headers });
    if (response.status !== 200 || !Array.isArray(response.body?.jobs)) throw new Error('QUEUE_UNAVAILABLE');
    let failed = 0;
    for (const job of response.body.jobs) {
        let status = 'ERROR';
        let errorCode = 'REQUEST_FAILED';
        try { status = await processJob(config, job, call); }
        catch (error) {
            failed++;
            const message = error instanceof Error ? error.message : '';
            errorCode = /^[A-Z_]+$/.test(message) ? message : 'REQUEST_FAILED';
            // Only our fixed error codes are emitted; never emit vendor bodies or input values.
            console.error('Enrollment attempt failed:', /^[A-Z_]+(?:: [A-Z_]+)?$/.test(message) ? message : 'REQUEST_FAILED');
        }
        const receipt = await call(`${config.cloudUrl}/api/sync/enrollments`, { method: 'POST', headers,
            body: { id: job.id, revision: job.revision, leaseToken: job.leaseToken, status, errorCode,
                ...(job.resolvedUserId ? { remoteUserId: job.resolvedUserId } : {}) } });
        if (receipt.status !== 200 && receipt.status !== 409) throw new Error('RECEIPT_FAILED');
    }
    return { failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // Configuration file stays on the school server, outside version control.
    if (process.env.PONTUAL_AGENT_CONFIG_FILE) {
        const values = JSON.parse(await readFile(process.env.PONTUAL_AGENT_CONFIG_FILE, 'utf8'));
        for (const [key, value] of Object.entries(values)) {
            if (typeof value !== 'string') throw new Error('CONFIG_VALUES_MUST_BE_STRINGS');
            if (process.env[key] === undefined) process.env[key] = value;
        }
    }
    const config = loadConfig();
    const vendorRequest = config.certificatePin ? pinnedBioStarRequest(config.biostarUrl, config.certificatePin) : request;
    const transport = (url, options) => new URL(url).origin === new URL(config.biostarUrl).origin ? vendorRequest(url, options) : request(url, options);
    do {
        try {
            const result = await runOnce(config, transport);
            if (process.argv.includes('--once') && result.failed) process.exitCode = 1;
        }
        catch {
            if (process.argv.includes('--once')) process.exitCode = 1;
            console.error('Enrollment agent: cycle failed; will retry. Check configuration, certificates and connectivity.');
        }
        if (process.argv.includes('--once')) break;
        await new Promise(resolve => setTimeout(resolve, 15000));
    } while (true);
}
