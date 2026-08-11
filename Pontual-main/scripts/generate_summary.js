const API_KEY = 'ca9605b9d17b330391a3f2e25ac6c5b1';
const API_SECRET = '8a19bfac316a3c3c4cab75b7a0dd7d7f';
const API_URL = 'https://api.eu.crosschexcloud.com/';

function calculateHours(records) {
    if (records.length < 2) return { workMs: 0, otMs: 0 };
    const sorted = records.sort((a, b) => new Date(a.checktime) - new Date(b.checktime));
    const first = new Date(sorted[0].checktime);
    const last = new Date(sorted[sorted.length - 1].checktime);
    let totalWorkMs = last - first;
    if (totalWorkMs > 6 * 60 * 60 * 1000) totalWorkMs -= 60 * 60 * 1000;
    let otHours = Math.max(0, (totalWorkMs / 3600000) - 8);
    if (otHours < 0.25) otHours = 0;
    return { workMs: totalWorkMs, otMs: otHours * 3600000 };
}

async function main() {
    const timestamp = new Date().toISOString().replace('Z', '+00:00');
    const requestId = Date.now() + '-summary';
    try {
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
        const list = recordsData.payload?.list || [];

        console.log(`Registos encontrados: ${list.length}`);
        if (list.length === 0) return;

        const employees = {};
        list.forEach(r => {
            const id = r.employee.workno;
            const name = (r.employee.first_name + ' ' + r.employee.last_name).trim();
            const date = r.checktime.split('T')[0];
            if (!employees[id]) employees[id] = { name, days: {} };
            if (!employees[id].days[date]) employees[id].days[date] = [];
            employees[id].days[date].push(r);
        });

        console.log('\nID  | Nome                 | Horas Total | Horas Extra | Notas');
        console.log('----|----------------------|-------------|-------------|-------------------');
        
        const sortedIds = Object.keys(employees).sort((a, b) => parseInt(a) - parseInt(b));
        
        for (const id of sortedIds) {
            let totalWorkMs = 0;
            let totalOtMs = 0;
            for (const date in employees[id].days) {
                const dayCalc = calculateHours(employees[id].days[date]);
                totalWorkMs += dayCalc.workMs;
                totalOtMs += dayCalc.otMs;
            }
            const workH = Math.floor(totalWorkMs / 3600000);
            const workM = Math.floor((totalWorkMs % 3600000) / 60000);
            const otH = Math.floor(totalOtMs / 3600000);
            const otM = Math.floor((totalOtMs % 3600000) / 60000);

            let note = '-';
            if (id === '18' || id === '11') {
                const exMs = 20 * 3600000;
                const payMs = Math.max(0, totalOtMs - exMs);
                note = `Isenção: Pago ${Math.floor(payMs/3600000)}h ${Math.floor((payMs%3600000)/60000)}m`;
            }

            console.log(`${id.padEnd(3)} | ${employees[id].name.padEnd(20)} | ${workH.toString().padStart(3)}h ${workM.toString().padStart(2, '0')}m | ${otH.toString().padStart(3)}h ${otM.toString().padStart(2, '0')}m | ${note}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
