import { spawn } from 'node:child_process';
if (!process.env.PATCH_TEST_DATABASE_URL) throw new Error('Set PATCH_TEST_DATABASE_URL to a direct PostgreSQL connection. No production defaults are loaded.');
const child = spawn(process.execPath, ['--test', 'tests/enrollment-postgres.test.mjs'], {
    env: { ...process.env, RUN_ISOLATED_PG_TESTS: 'true' }, stdio: 'inherit',
});
child.on('error', () => { process.exitCode = 1; });
child.on('close', code => { process.exitCode = code || 0; });
