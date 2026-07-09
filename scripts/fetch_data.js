const API_KEY = 'ca9605b9d17b330391a3f2e25ac6c5b1';
const API_SECRET = '8a19bfac316a3c3c4cab75b7a0dd7d7f';
const API_URL = 'https://api.eu.crosschexcloud.com/';

async function main() {
    const timestamp = new Date().toISOString().replace('Z', '+00:00');
    const requestId = Date.now() + '-test';

    try {
        // 1. Get Token
        const authRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                header: { nameSpace: 'authorize.token', nameAction: 'token', version: '1.0', requestId, timestamp },
                payload: { api_key: API_KEY, api_secret: API_SECRET }
            })
        });
        const authData = await authRes.json();
        const token = authData.payload?.token;

        if (!token) {
            console.error('Auth failed:', authData);
            return;
        }

        // 2. Fetch Records (26/03 to 25/04)
        const recordsRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                header: { nameSpace: "attendance.record", nameAction: "getrecord", version: "1.0", requestId, timestamp },
                authorize: { type: "token", token: token },
                payload: { begin_time: "2026-03-26T00:00:00+00:00", end_time: "2026-04-25T23:59:59+00:00", order: "asc", page: 1, per_page: 5000 }
            })
        });
        const recordsData = await recordsRes.json();
        console.log(JSON.stringify(recordsData.payload?.list || []));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
