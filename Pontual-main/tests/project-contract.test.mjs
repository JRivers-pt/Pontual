import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('normal build/start cannot migrate or destructively synchronize the database, and build type errors stay blocking', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    for (const command of [pkg.scripts.build, pkg.scripts.start]) {
        assert.doesNotMatch(command, /db\s+push|migrate\s+(deploy|reset|dev)|accept-data-loss/i);
    }
    const config = fs.readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(config, /ignoreBuildErrors\s*:\s*true/);
});
