import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

export async function isolatedDatabase() {
    const connectionString = process.env.PATCH_TEST_DATABASE_URL;
    if (process.env.RUN_ISOLATED_PG_TESTS !== 'true' || !connectionString) throw new Error('EXPLICIT_ISOLATED_DATABASE_REQUIRED');
    const sourceSchema = process.env.PATCH_TEST_SOURCE_SCHEMA;
    if (!/^pontual_fixture_[a-f0-9]{12}$/.test(sourceSchema || '')) throw new Error('EXPLICIT_FIXTURE_SCHEMA_REQUIRED');
    if (new URL(connectionString).hostname.includes('-pooler.')) throw new Error('DIRECT_CONNECTION_REQUIRED');
    const schema = 'pontual_sandbox_' + randomBytes(6).toString('hex');
    const admin = new Client({ connectionString });
    let prisma, created = false;
    const close = async () => {
        await prisma?.$disconnect();
        if (created && /^pontual_sandbox_[a-f0-9]{12}$/.test(schema)) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
    };
    try {
        await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
        for (const table of ['User','Employee','Schedule','EmployeeSchedule','AttendanceLog','AuditLog']) {
            // Definitions only, never customer rows. All subsequent model SQL is schema-qualified.
            await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE "${sourceSchema}"."${table}" INCLUDING ALL)`);
        }
        await admin.query(`CREATE TYPE "${schema}"."Role" AS ENUM ('ADMIN','CLIENT')`);
        await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" DROP DEFAULT`);
        await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" TYPE "${schema}"."Role" USING "role"::text::"${schema}"."Role"`);
        await admin.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN "role" SET DEFAULT 'CLIENT'::"${schema}"."Role"`);
        await admin.query(`SET search_path TO "${schema}"`);
        await admin.query(fs.readFileSync(new URL('../../prisma/changes/20261030_enrollment_queue.sql',import.meta.url),'utf8'));
        const url = new URL(connectionString); url.searchParams.set('schema',schema);url.searchParams.set('connection_limit','6');
        let query = '';
        prisma = new PrismaClient({datasources:{db:{url:url.toString()}},log:[{emit:'event',level:'query'}]});
        prisma.$on('query',event=>{query=event.query;});
        const guard = async () => {
            query='';await prisma.user.findMany({take:1,select:{id:true}});
            if(!query.includes(`"${schema}"."User"`)) throw new Error('UNSAFE_DATABASE_NAMESPACE');
        };
        await guard();
        const schoolId='sandbox-'+randomBytes(5).toString('hex');
        await prisma.user.create({data:{id:schoolId,username:schoolId,password:'not-a-login-hash',company:'CMB Sandbox',syncToken:'sandbox-only-token',biometricProvider:'SUPREMA'}});
        await prisma.schedule.create({data:{userId:schoolId,name:'H9 - Sandbox 08:00 às 17:00',startTime:'08:00',endTime:'17:00',lunchDuration:60}});
        const reset = async () => {
            await guard();
            for(const model of ['enrollmentTask','enrollmentAgent','employeeSchedule','attendanceLog','employee','auditLog']) await prisma[model].deleteMany();
        };
        return {prisma,schoolId,guard,reset,close};
    } catch(error) {await close().catch(()=>{});throw error;}
}
