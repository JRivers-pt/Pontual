// Test-only worker: all IO is delegated over IPC to the sandbox origin allowlist.
// No CLI configuration, environment credentials or network transport is used.
import { runOnce } from '../../school-agent/enrollment-agent.mjs';
let next = 0;
const pending = new Map();
process.on('message', async message => {
    if (message.type === 'reply') {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error));
        else waiter.resolve({ ...message.result, headers: new Headers(message.result.headers) });
    } else if (message.type === 'start') {
        try {
            const result = await runOnce(message.config, (url, options) => new Promise((resolve, reject) => {
                const id = ++next; pending.set(id, { resolve, reject });
                process.send({ type: 'call', id, url, options });
            }));
            process.send({ type: 'done', result }, () => process.disconnect());
        } catch {
            process.send({ type: 'failed' }, () => process.disconnect());
            process.exitCode = 1;
        }
    }
});
