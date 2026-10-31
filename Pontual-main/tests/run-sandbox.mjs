import { spawn } from 'node:child_process';
if(!process.env.PATCH_TEST_DATABASE_URL)throw new Error('Set PATCH_TEST_DATABASE_URL explicitly. Sandbox never loads production credentials.');
const child=spawn(process.execPath,['--test','--test-reporter=spec','tests/sandbox/browser.test.mjs'],{env:{...process.env,RUN_ISOLATED_PG_TESTS:'true'},stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});child.on('close',code=>{process.exitCode=code||0;});
