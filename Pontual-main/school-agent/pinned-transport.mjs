import https from 'node:https';
import tls from 'node:tls';
import { createHash, timingSafeEqual } from 'node:crypto';

export function matchesCertificatePin(raw, expected) {
    const pin = String(expected).replace(/:/g, '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(pin) || !Buffer.isBuffer(raw)) return false;
    return timingSafeEqual(createHash('sha256').update(raw).digest(), Buffer.from(pin, 'hex'));
}

// HTTP credentials are sent only after the private BioStar certificate matches the provisioned pin.
// Cloud requests continue to use the platform's normal certificate and hostname verification.
export function pinnedBioStarRequest(origin, pin) {
    const agent = new https.Agent({ keepAlive: false });
    agent.createConnection = (options, callback) => {
        const socket = tls.connect({ ...options, rejectUnauthorized: false });
        let complete = false;
        const finish = (error, connection) => {
            if (complete) return;
            complete = true;
            callback(error, connection);
        };
        socket.setTimeout(15000, () => socket.destroy(new Error('TLS_TIMEOUT')));
        socket.once('error', error => finish(error));
        socket.once('secureConnect', () => {
            if (!matchesCertificatePin(socket.getPeerCertificate().raw, pin)) {
                const error = new Error('CERTIFICATE_PIN_MISMATCH');
                finish(error);
                socket.destroy();
            } else finish(null, socket);
        });
        // Do not return the socket early: that would release the HTTP request before checking the pin.
        return undefined;
    };
    return async (url, { method = 'GET', headers = {}, body } = {}) => {
        const target = new URL(url);
        if (target.origin !== new URL(origin).origin) throw new Error('UNEXPECTED_ORIGIN');
        const payload = body ? JSON.stringify(body) : null;
        return new Promise((resolve, reject) => {
            const req = https.request(target, { method, agent, headers: { ...headers,
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, response => {
                let data = '';
                response.on('data', chunk => {
                    data += chunk;
                    if (data.length > 8_000_000) req.destroy(new Error('RESPONSE_TOO_LARGE'));
                });
                response.on('error', reject);
                response.on('end', () => {
                    let parsed; try { parsed = JSON.parse(data); } catch { parsed = null; }
                    resolve({ status: response.statusCode, body: parsed, headers: new Headers(
                        Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])
                    ) });
                });
            });
            const deadline = setTimeout(() => req.destroy(new Error('REQUEST_TIMEOUT')), 15000);
            req.once('close', () => clearTimeout(deadline));
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    };
}
