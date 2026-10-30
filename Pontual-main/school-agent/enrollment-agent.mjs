import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function requireSuccess(result, operation) {
    if (!result || result.status < 200 || result.status >= 300) throw new Error(`${operation}: HTTP_FAILURE`);
    if (!result.body?.Response || String(result.body.Response.code) !== '0') throw new Error(`${operation}: VENDOR_FAILURE`);
    const rows = result.body.DeviceCollection?.rows;
    if (Array.isArray(rows) && rows.some(row => row.status === 'ERROR' || Number(row.error_code || 0) !== 0)) {
        throw new Error(`${operation}: DEVICE_FAILURE`);
    }
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
    };
    if (!config.token || !config.biostarUrl || !config.login || !config.password || !config.terminals.length) {
        throw new Error('MISSING_CONFIGURATION');
    }
    if (new URL(config.cloudUrl).protocol !== 'https:' || new URL(config.biostarUrl).protocol !== 'https:') {
        throw new Error('HTTPS_REQUIRED');
    }
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
    if (!config.terminals.includes(job.terminalId)) throw new Error('UNCONFIGURED_TERMINAL');
    const explicitId = config.userMap[job.workno];
    const userId = explicitId || (config.allowNumericIds && /^\d+$/.test(job.workno) ? String(Number(job.workno)) : null);
    if (!userId || !/^\d+$/.test(String(userId))) throw new Error('USER_MAPPING_REQUIRED');
    if (job.active && !job.employee) throw new Error('EMPLOYEE_MISSING');
    const cloudHeaders = { 'x-school-token': config.token };
    const fence = async () => {
        const result = await call(`${config.cloudUrl}/api/sync/enrollments`, {
            method: 'PATCH', headers: cloudHeaders, body: { id: job.id, revision: job.revision, leaseToken: job.leaseToken },
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
    try {
        const url = `${config.biostarUrl}/api/users/${encodeURIComponent(userId)}`;
        const existing = await call(url, { headers });
        let exists = false;
        if (existing.status === 200) {
            const body = requireSuccess(existing, 'READ_USER');
            exists = String(body.User?.user_id) === String(userId);
            if (!exists) throw new Error('USER_RESPONSE_INVALID');
            // Numeric IDs can collide with unrelated existing users. Require an explicit mapping.
            if (!explicitId && body.User.name !== job.employee?.name) throw new Error('USER_ID_COLLISION');
        } else if (existing.status !== 404) throw new Error('READ_USER_FAILED');

        await fence();
        if (!exists && job.active) {
            if (!config.accessGroups.length) throw new Error('ACCESS_GROUPS_REQUIRED');
            requireSuccess(await call(`${config.biostarUrl}/api/users`, { method: 'POST', headers,
                body: { User: { user_id: String(userId), name: job.employee.name,
                    user_group_id: { id: config.userGroup }, access_groups: config.accessGroups.map(id => ({ id })),
                    disabled: false } } }), 'CREATE_USER');
            exists = true;
        }
        if (exists) {
            await fence();
            const User = job.active ? { name: job.employee.name, disabled: false,
                ...(job.employee.fingerprintTemplate ? { fingerprint_templates:
                    [{ template0: job.employee.fingerprintTemplate, template1: job.employee.fingerprintTemplate, finger_mask: false }] }
                    : job.clearFingerprint ? { fingerprint_templates: [] } : {}) }
                : { disabled: true };
            // An explicit removal clears old templates rather than leaving a stale credential active.
            requireSuccess(await call(url, { method: 'PUT', headers, body: { User } }), 'UPDATE_USER');
            await fence();
            requireSuccess(await call(`${config.biostarUrl}/api/users/export?overwrite=true&id=${encodeURIComponent(userId)}`, {
                method: 'POST', headers, body: { DeviceCollection: { rows: [{ id: job.terminalId }] } },
            }), 'EXPORT_USER');
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
        try { status = await processJob(config, job, call); }
        catch (error) {
            failed++;
            // Only our fixed error codes are emitted; never emit vendor bodies or input values.
            console.error('Enrollment attempt failed:', /^[A-Z_]+(?:: [A-Z_]+)?$/.test(error.message) ? error.message : 'REQUEST_FAILED');
        }
        const receipt = await call(`${config.cloudUrl}/api/sync/enrollments`, { method: 'POST', headers,
            body: { id: job.id, revision: job.revision, leaseToken: job.leaseToken, status } });
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
    do {
        try {
            const result = await runOnce(config);
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
