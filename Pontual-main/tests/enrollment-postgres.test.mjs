import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import * as fingerprintFormat from '../school-agent/fingerprint-format.mjs';
const require = createRequire(import.meta.url);
const enabled = process.env.RUN_ISOLATED_PG_TESTS === 'true';
const it = (name, fn) => test(name, { skip: !enabled }, fn);
const schema = 'pontual_patch_' + randomBytes(6).toString('hex');
const schoolId = 'isolated-school';
let prisma, admin, sync, routes, employees, punches, statusRoutes, schemaCreated = false;
let lastQuery = '';
async function assertIsolatedClient() {
    // Prisma schema-qualifies model SQL; current_schema() is not an isolation check for its raw queries.
    lastQuery = '';
    await prisma.user.findMany({ take: 1, select: { id: true } });
    assert.ok(lastQuery.includes(`"${schema}"."User"`), 'Refuse test writes unless actual Prisma model SQL targets the dedicated schema');
}
function load(file, overrides = {}) {
    const ts = require('typescript');
    const js = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const context = { exports: {}, process: { env: { ENROLLMENT_SYNC_USER_ID: schoolId, ENROLLMENT_TERMINAL_IDS: '1,2,3' } },
        Error, Date, URL, console, require: name => {
            if (name in overrides) return overrides[name];
            if (name === '@/lib/db') return { prisma };
            if (name === '@/lib/enrollment-sync') return sync;
            if (name === '@/lib/sync-identity') return load('../src/lib/sync-identity.ts');
            if (name === '@/lib/workno') return load('../src/lib/workno.ts');
            if (name === '@/lib/fingerprint-format') return fingerprintFormat;
            if (name === '@/auth') return { auth: handler => handler };
            if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
            return require(name);
        } };
    vm.runInNewContext(js, context);
    return context.exports;
}
const request = (body, token = 'isolated-token', user = schoolId) => ({
    headers: new Headers(token ? { 'x-school-token': token } : {}),
    auth: user ? { user: { id: user, name: 'Synthetic test operator' } } : null,
    json: async () => body,
});
const pair = fingerprintFormat.encodeFingerprintPair('synthetic-first', 'synthetic-second');
async function add(workno = '0908') {
    const employee = await prisma.employee.create({ data: { userId: schoolId, workno, name: 'Synthetic ' + workno, fingerprintTemplate: pair, numFingerprints: 1 } });
    await prisma.$transaction(tx => sync.enqueueEnrollment(tx, schoolId, employee));
    return employee;
}
async function claim() { return (await routes.GET(request())).body.jobs[0]; }
const receipt = (job, extra = {}) => request({ id: job.id, revision: job.revision, leaseToken: job.leaseToken, status: 'EXPORTED', ...extra });

before(async () => {
    if (!enabled) return;
    if (!process.env.PATCH_TEST_DATABASE_URL || !/^pontual_patch_[a-f0-9]{12}$/.test(schema)) throw new Error('ISOLATED_DATABASE_CONFIGURATION_REQUIRED');
    if (new URL(process.env.PATCH_TEST_DATABASE_URL).hostname.includes('-pooler.')) throw new Error('DIRECT_CONNECTION_REQUIRED_FOR_SCHEMA_ISOLATION');
    const { Client } = require('pg');
    const { PrismaClient } = require('@prisma/client');
    admin = new Client({ connectionString: process.env.PATCH_TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    // Schema definitions only: no customer rows are copied into the isolated namespace.
    for (const table of ['User', 'Employee', 'Schedule', 'EmployeeSchedule', 'AttendanceLog', 'AuditLog']) {
        await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await admin.query(`CREATE TYPE "${schema}"."Role" AS ENUM ('ADMIN','CLIENT')`);
    await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" DROP DEFAULT`);
    await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" TYPE "${schema}"."Role" USING "role"::text::"${schema}"."Role"`);
    await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" SET DEFAULT 'CLIENT'::"${schema}"."Role"`);
    await admin.query(`SET search_path TO "${schema}", public`);
    await admin.query(fs.readFileSync(new URL('../prisma/changes/20261030_enrollment_queue.sql', import.meta.url), 'utf8'));
    const url = new URL(process.env.PATCH_TEST_DATABASE_URL);
    url.searchParams.set('schema', schema);
    url.searchParams.set('connection_limit', '6');
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ emit: 'event', level: 'query' }] });
    prisma.$on('query', event => { lastQuery = event.query; });
    await assertIsolatedClient();
    await prisma.user.createMany({ data: [
        { id: schoolId, username: 'isolated-school', password: 'not-a-login-hash', syncToken: 'isolated-token', biometricProvider: 'SUPREMA' },
        { id: 'other-school', username: 'isolated-other', password: 'not-a-login-hash', syncToken: 'other-token', biometricProvider: 'SUPREMA' },
    ] });
    sync = load('../src/lib/enrollment-sync.ts');
    routes = load('../src/app/api/sync/enrollments/route.ts');
    employees = load('../src/app/api/employees/route.ts');
    punches = load('../src/app/api/sync/punches/route.ts');
    statusRoutes = load('../src/app/api/employees/sync-status/route.ts');
});
beforeEach(async () => {
    if (!enabled || !prisma) return;
    await assertIsolatedClient();
    await prisma.enrollmentTask.deleteMany();
    await prisma.enrollmentAgent.deleteMany();
    await prisma.employeeSchedule.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.attendanceLog.deleteMany();
    await prisma.auditLog.deleteMany();
});
after(async () => {
    await prisma?.$disconnect();
    if (admin) {
        if (schemaCreated && /^pontual_patch_[a-f0-9]{12}$/.test(schema)) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
    }
});

it('PostgreSQL: create commits employee, schedule and all three terminal tasks together', async () => {
    const schedule = await prisma.schedule.create({ data: { userId: schoolId, name: 'H9 - synthetic', startTime: '08:00', endTime: '17:00' } });
    const result = await employees.POST(request({ workno: '908', name: 'Synthetic employee', scheduleId: schedule.id, active: true, fingerprintTemplate: pair }));
    assert.equal(result.status, 200);
    assert.equal(await prisma.employee.count(), 1);
    assert.equal(await prisma.employeeSchedule.count(), 1);
    assert.equal(await prisma.enrollmentTask.count(), 3);
    assert.equal((await prisma.employee.findFirst()).fingerprintTemplate, pair);
});
it('PostgreSQL: duplicate employee never duplicates tasks', async () => {
    const input = { workno: '0908', name: 'Synthetic employee' };
    assert.equal((await employees.POST(request(input))).status, 200);
    assert.equal((await employees.POST(request(input))).status, 409);
    assert.equal(await prisma.employee.count(), 1);
    assert.equal(await prisma.enrollmentTask.count(), 3);
});
it('PostgreSQL: a single legacy sample is rejected before any write', async () => {
    const result = await employees.POST(request({ workno: '0908', name: 'Synthetic', fingerprintTemplate: 'single-sample' }));
    assert.equal(result.status, 400);
    assert.equal(await prisma.employee.count(), 0);
    assert.equal(await prisma.enrollmentTask.count(), 0);
});
it('PostgreSQL: a foreign schedule rolls back employee and queue', async () => {
    const schedule = await prisma.schedule.create({ data: { userId: 'other-school', name: 'Foreign schedule' } });
    const result = await employees.POST(request({ workno: '0908', name: 'Synthetic', scheduleId: schedule.id }));
    assert.equal(result.status, 400);
    assert.equal(await prisma.employee.count(), 0);
    assert.equal(await prisma.enrollmentTask.count(), 0);
});
it('PostgreSQL: queue failure rolls back an employee edit', async () => {
    const employee = await prisma.employee.create({ data: { userId: schoolId, workno: '0908', name: 'Original synthetic' } });
    const failing = load('../src/app/api/employees/route.ts', { '@/lib/enrollment-sync': { ...sync, enqueueEnrollment: async () => { throw new Error('Synthetic queue failure'); } } });
    assert.equal((await failing.PUT(request({ workno: '0908', name: 'Must roll back' }))).status, 500);
    assert.equal((await prisma.employee.findUnique({ where: { id: employee.id } })).name, 'Original synthetic');
});
it('PostgreSQL: concurrent claimers cannot process sibling terminals at the same time', async () => {
    await add();
    const results = await Promise.all(Array.from({ length: 6 }, () => routes.GET(request())));
    const jobs = results.flatMap(r => r.body.jobs);
    assert.equal(jobs.length, 1);
    assert.equal(await prisma.enrollmentTask.count({ where: { status: 'PROCESSING' } }), 1);
});
it('PostgreSQL: different employees can progress concurrently', async () => {
    await add('0908'); await add('0909');
    const results = await Promise.all([routes.GET(request()), routes.GET(request())]);
    assert.equal(new Set(results.flatMap(r => r.body.jobs).map(j => j.workno)).size, 2);
});
it('PostgreSQL: an edit invalidates an old receipt and holds sibling work until lease expiry', async () => {
    const employee = await add(); const job = await claim();
    await prisma.$transaction(async tx => {
        const updated = await tx.employee.update({ where: { id: employee.id }, data: { name: 'Updated synthetic' } });
        await sync.enqueueEnrollment(tx, schoolId, updated);
    });
    assert.equal((await routes.POST(receipt(job))).status, 409);
    assert.equal((await routes.GET(request())).body.jobs.length, 0);
});
it('PostgreSQL: expired work is re-leased with a new token and rejects the old receipt', async () => {
    await add(); const old = await claim();
    await prisma.enrollmentTask.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const fresh = await claim();
    assert.notEqual(fresh.leaseToken, old.leaseToken);
    assert.equal((await routes.POST(receipt(old))).status, 409);
    assert.equal((await routes.POST(receipt(fresh))).status, 200);
});
it('PostgreSQL: a lease near expiry cannot authorize another vendor write', async () => {
    await add(); const job = await claim();
    await prisma.enrollmentTask.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(Date.now() + 30000) } });
    assert.equal((await routes.PATCH(receipt(job))).status, 409);
    assert.equal((await routes.POST(receipt(job, { status: 'ERROR' }))).status, 200);
});
it('PostgreSQL: identity binding propagates to all terminals and rejects cross-employee collisions', async () => {
    await add('0908'); await add('0909');
    const first = await claim();
    assert.equal((await routes.PATCH(receipt(first, { remoteUserId: '1000908' }))).status, 200);
    assert.equal(await prisma.enrollmentTask.count({ where: { workno: first.workno, remoteUserId: '1000908' } }), 3);
    const second = await claim();
    assert.notEqual(second.workno, first.workno);
    assert.equal((await routes.POST(receipt(second, { remoteUserId: '1000908' }))).status, 409);
    assert.equal((await prisma.enrollmentTask.findUnique({ where: { id: second.id } })).status, 'PROCESSING');
    assert.equal(await prisma.enrollmentTask.count({ where: { workno: second.workno, remoteUserId: { not: null } } }), 0);
});
it('PostgreSQL: failed work waits for backoff then retries without losing the employee', async () => {
    await add(); const job = await claim();
    assert.equal((await routes.POST(receipt(job, { status: 'ERROR', errorCode: 'DEVICE_READBACK_FAILED' }))).status, 200);
    const failed = await prisma.enrollmentTask.findUnique({ where: { id: job.id } });
    assert.ok(failed.nextAttemptAt > new Date());
    await prisma.enrollmentTask.updateMany({ data: { status: 'EXPORTED' }, where: { id: { not: job.id } } });
    assert.equal((await routes.GET(request())).body.jobs.length, 0);
    await prisma.enrollmentTask.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    assert.equal((await claim()).id, job.id);
    assert.equal(await prisma.employee.count(), 1);
});
it('PostgreSQL: unauthenticated and other-school requests cannot access the queue', async () => {
    await add();
    assert.equal((await routes.GET(request(null, null))).status, 401);
    assert.equal((await routes.GET(request(null, 'other-token'))).status, 409);
    assert.equal((await employees.GET(request(null, null, null))).status, 401);
    assert.equal(await prisma.enrollmentTask.count({ where: { status: 'PROCESSING' } }), 0);
});
it('PostgreSQL: deleting a new employee preserves bound revocation tasks', async () => {
    await add();
    await prisma.$transaction(tx => sync.bindRemoteIdentity(tx, schoolId, '0908', '1000908'));
    const req = request(); req.url = 'https://example.invalid/api/employees?workno=0908';
    assert.equal((await employees.DELETE(req)).status, 200);
    assert.equal(await prisma.employee.count(), 0);
    assert.equal(await prisma.enrollmentTask.count({ where: { active: false, remoteUserId: '1000908' } }), 3);
    assert.equal((await claim()).active, false);
});
it('PostgreSQL: an original attendance-daemon fallback ID resolves to the new employee number', async () => {
    await add();
    await prisma.$transaction(tx => sync.bindRemoteIdentity(tx, schoolId, '0908', '1000908'));
    const result = await punches.POST(request({ punches: [{ workno: '1000908', checktime: '2026-10-30T12:00:00Z', rawEventId: 'synthetic-event' }] }));
    assert.equal(result.status, 200);
    assert.equal((await prisma.attendanceLog.findFirst()).workno, '0908');
});

it('PostgreSQL: leading zeros do not create a second identity for the same employee', async () => {
    assert.equal((await employees.POST(request({ workno: '0908', name: 'Synthetic' }))).status, 200);
    assert.equal((await employees.POST(request({ workno: '0000908', name: 'Duplicate alias' }))).status, 409);
    assert.equal(await prisma.employee.count(), 1);
});
it('PostgreSQL: an unknown CMB schedule is rejected without partial creation', async () => {
    assert.equal((await employees.POST(request({ workno: '0908', name: 'Synthetic', scheduleCode: 'H99' }))).status, 400);
    assert.equal(await prisma.employee.count(), 0);
    assert.equal(await prisma.enrollmentTask.count(), 0);
});
it('PostgreSQL: explicitly clearing the work schedule removes old links too', async () => {
    const schedule = await prisma.schedule.create({ data: { userId: schoolId, name: 'H9 - synthetic' } });
    await employees.POST(request({ workno: '0908', name: 'Synthetic', scheduleCode: 'H9', scheduleId: schedule.id }));
    assert.equal((await employees.PUT(request({ workno: '0908', scheduleCode: null }))).status, 200);
    assert.equal(await prisma.employeeSchedule.count(), 0);
    assert.equal((await prisma.employee.findFirst()).scheduleCode, null);
});
it('PostgreSQL: manual retry keeps a live lease intact', async () => {
    await add(); const job = await claim();
    assert.equal((await statusRoutes.POST(request({ workno: '0908' }))).status, 200);
    const task = await prisma.enrollmentTask.findUnique({ where: { id: job.id } });
    assert.equal(task.status, 'PROCESSING');
    assert.equal(task.leaseToken, job.leaseToken);
});
it('PostgreSQL: invalid remote identities cannot bind or confirm work', async () => {
    await add(); const job = await claim();
    for (const remoteUserId of ['1', '0002', '4294967296', '../user']) {
        assert.equal((await routes.POST(receipt(job, { remoteUserId }))).status, 400);
    }
    assert.equal(await prisma.enrollmentTask.count({ where: { remoteUserId: { not: null } } }), 0);
});
it('PostgreSQL: a receipt replay cannot change a completed task', async () => {
    await add(); const job = await claim();
    assert.equal((await routes.POST(receipt(job))).status, 200);
    assert.equal((await routes.POST(receipt(job, { status: 'ERROR' }))).status, 409);
    assert.equal((await prisma.enrollmentTask.findUnique({ where: { id: job.id } })).status, 'EXPORTED');
});
it('PostgreSQL: concurrent identity reservations allow only one employee per remote ID', async () => {
    await add('0908'); await add('0909');
    const results = await Promise.allSettled(['0908','0909'].map(workno => prisma.$transaction(tx => sync.bindRemoteIdentity(tx, schoolId, workno, '1000908'))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const bound = await prisma.enrollmentTask.findMany({ where: { remoteUserId: '1000908' }, select: { workno: true } });
    assert.equal(bound.length, 3);
    assert.equal(new Set(bound.map(row => row.workno)).size, 1);
});
it('PostgreSQL: a health probe neither claims jobs nor creates a false worker heartbeat', async () => {
    await add();
    const req = request(); req.nextUrl = new URL('https://synthetic.invalid/api/sync/enrollments?health=true');
    const result = await routes.GET(req);
    assert.equal(result.status, 200);
    assert.equal(result.body.online, false);
    assert.equal(result.body.pendingCount, 3);
    assert.equal(await prisma.enrollmentTask.count({ where: { status: 'PENDING' } }), 3);
    assert.equal(await prisma.enrollmentAgent.count(), 0);
});
