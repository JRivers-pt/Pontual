// Disposable local PostgreSQL only. Never reads .env or accepts an existing DB URL.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = process.env.PONTUAL_TEST_PG_BIN;
const browserChannel = process.env.SANDBOX_BROWSER_CHANNEL || 'chrome';
if (!['chrome', 'msedge'].includes(browserChannel)) throw new Error('Use SANDBOX_BROWSER_CHANNEL=chrome or msedge');
if (!bin || !path.isAbsolute(bin)) throw new Error('Set PONTUAL_TEST_PG_BIN to an absolute portable PostgreSQL bin directory');
const suffix = process.platform === 'win32' ? '.exe' : '';
for (const name of ['initdb', 'pg_ctl', 'postgres']) await fs.access(path.join(bin, name + suffix));
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|pathext|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|homedrive|homepath|number_of_processors|processor_architecture)$/i.test(key)));
const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pontual-disposable-'));
const dataDir = path.join(runDir, 'data');
const passwordFile = path.join(runDir, 'password');
const password = randomBytes(32).toString('hex');
const sourceSchema = 'pontual_fixture_' + randomBytes(6).toString('hex');
const redact = text => String(text).replaceAll(password, '[masked]').replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[masked database URL]');
async function run(command, args, { env = baseEnv, capture = false } = {}) {
    return new Promise((resolve, reject) => {
        let stdout = '', stderr = '';
        const child = spawn(command, args, { cwd: runDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', chunk => { stdout += chunk; if (!capture) process.stdout.write(redact(chunk)); });
        child.stderr.on('data', chunk => { stderr += chunk; if (!capture) process.stderr.write(redact(chunk)); });
        child.once('error', reject);
        // Windows postmaster can retain inherited pipe handles after pg_ctl exits.
        // pg_ctl -w already waits for readiness; its exit status is authoritative here.
        const isPgCtl = path.basename(command).startsWith('pg_ctl');
        child.once(isPgCtl ? 'exit' : 'close', code => {
            if (isPgCtl) { child.stdout.destroy(); child.stderr.destroy(); }
            code === 0 ? resolve(stdout) : reject(new Error(redact(`${path.basename(command)} exited ${code}\n${stderr.slice(-4000)}`)));
        });
    });
}
const port = await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(error => error ? reject(error) : resolve(value)); });
});
const pgctl = path.join(bin, 'pg_ctl' + suffix);
let started = false, admin;
try {
    await fs.writeFile(passwordFile, password, { mode: 0o600 });
    await run(path.join(bin, 'initdb' + suffix), ['-D', dataDir, '-U', 'sandbox', '--auth=scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--no-locale'], { capture: true });
    await fs.unlink(passwordFile);
    await run(pgctl, ['start', '-D', dataDir, '-l', path.join(runDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w']);
    started = true;
    const connectionString = `postgresql://sandbox:${password}@127.0.0.1:${port}/postgres`;
    admin = new Client({ connectionString }); await admin.connect();
    const identity = (await admin.query('SELECT inet_server_addr()::text AS host, inet_server_port() AS port, version() AS version')).rows[0];
    if (identity.host !== '127.0.0.1/32' && identity.host !== '127.0.0.1' || Number(identity.port) !== port) {
        throw new Error(`DISPOSABLE_SERVER_IDENTITY_MISMATCH host=${identity.host} port=${identity.port}; expected loopback port ${port}`);
    }
    console.log(`Disposable server verified: ${identity.version}; loopback only. Credentials masked.`);
    // Diff generates DDL without accessing a DB. Use a temporary schema file to avoid repository .env discovery.
    const schemaFile = path.join(runDir, 'fixture.prisma');
    await fs.copyFile(path.join(root, 'prisma/schema.prisma'), schemaFile);
    const ddlRaw = await run(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaFile, '--script'], { capture: true });
    const ddl = ddlRaw.replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, '');
    if (/\bpublic\b/i.test(ddl) || !ddl.includes('CREATE TABLE "Employee"')) throw new Error('UNEXPECTED_FIXTURE_DDL');
    await admin.query(`CREATE SCHEMA "${sourceSchema}"`);
    await admin.query(`SET search_path TO "${sourceSchema}"`);
    await admin.query(ddl);
    const childEnv = { ...baseEnv, RUN_ISOLATED_PG_TESTS: 'true', PATCH_TEST_DATABASE_URL: connectionString, PATCH_TEST_SOURCE_SCHEMA: sourceSchema,
        SANDBOX_BROWSER_CHANNEL: browserChannel, SANDBOX_ARTIFACT_DIR: path.join(runDir, 'browser-artifacts') };
    // Explicit test entrypoints only; no author/private runner, migrations, app start or external network.
    console.log('Running PostgreSQL integration');
    await run(process.execPath, ['--test', '--test-reporter=spec', path.join(root, 'tests/enrollment-postgres.test.mjs')], { env: childEnv });
    console.log('Running browser sandbox with emulated USB/BioStar');
    await run(process.execPath, ['--test', '--test-reporter=spec', path.join(root, 'tests/sandbox/browser.test.mjs')], { env: childEnv });
    console.log('Both disposable suites passed.');
} catch (error) {
    console.error(redact(error.message)); process.exitCode = 1;
} finally {
    await admin?.end().catch(() => {});
    await fs.unlink(passwordFile).catch(error => { if (error.code !== 'ENOENT') console.error('Temporary password removal failed'); });
    if (started) {
        try { await run(pgctl, ['stop', '-D', dataDir, '-m', 'fast', '-w']); }
        catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
    }
    console.log(`Disposable data and screenshots retained locally at ${runDir}; no recursive deletion performed.`);
}
