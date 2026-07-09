const API_KEY = 'ca9605b9d17b330391a3f2e25ac6c5b1';
const API_SECRET = '8a19bfac316a3c3c4cab75b7a0dd7d7f';
const API_URL = 'https://api.eu.crosschexcloud.com/';

async function main() {
    const ts  = new Date().toISOString().replace('Z', '+00:00');
    const rid = Date.now() + '-auth';

    const authRes = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            header: { nameSpace: 'authorize.token', nameAction: 'token', version: '1.0', requestId: rid, timestamp: ts },
            payload: { api_key: API_KEY, api_secret: API_SECRET }
        })
    });
    const { payload: { token } } = await authRes.json();

    // Check total count with page 1
    const res1 = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            header: { nameSpace: "attendance.record", nameAction: "getrecord", version: "1.0", requestId: rid+'1', timestamp: ts },
            authorize: { type: "token", token },
            payload: { begin_time: "2026-03-26T00:00:00+00:00", end_time: "2026-04-25T23:59:59+00:00", order: "asc", page: 1, per_page: 200 }
        })
    });
    const data1 = await res1.json();
    console.log('Page 1 count:', data1.payload?.list?.length);
    console.log('Total (header):', JSON.stringify(data1.payload?.total || data1.payload?.count || 'N/A'));
    console.log('Full payload keys:', Object.keys(data1.payload || {}));

    // Try page 2
    const res2 = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            header: { nameSpace: "attendance.record", nameAction: "getrecord", version: "1.0", requestId: rid+'2', timestamp: ts },
            authorize: { type: "token", token },
            payload: { begin_time: "2026-03-26T00:00:00+00:00", end_time: "2026-04-25T23:59:59+00:00", order: "asc", page: 2, per_page: 200 }
        })
    });
    const data2 = await res2.json();
    console.log('Page 2 count:', data2.payload?.list?.length);
    console.log('Page 2 header code:', data2.header?.code);

    // Try page 3
    const res3 = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            header: { nameSpace: "attendance.record", nameAction: "getrecord", version: "1.0", requestId: rid+'3', timestamp: ts },
            authorize: { type: "token", token },
            payload: { begin_time: "2026-03-26T00:00:00+00:00", end_time: "2026-04-25T23:59:59+00:00", order: "asc", page: 3, per_page: 200 }
        })
    });
    const data3 = await res3.json();
    console.log('Page 3 count:', data3.payload?.list?.length);
}

main().catch(console.error);
