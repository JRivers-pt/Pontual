const fs = require('fs');
const path = require('path');

const SUMMARY_FILE = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios', 'MonthlyAttendance_AllDepts_260326_to_260425_7502.xls');
const RECORDS_FILE = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios', 'Records_AllDepts_260326_to_260425_7502.xls');
const OUTPUT_DIR   = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios');

const START_DATE_STR = '2026-03-26';
const END_DATE_STR   = '2026-04-25';

const ALL_DATES = [];
let curr = new Date(START_DATE_STR + 'T00:00:00Z');
const end = new Date(END_DATE_STR + 'T00:00:00Z');
while (curr <= end) {
    ALL_DATES.push(new Date(curr));
    curr.setUTCDate(curr.getUTCDate() + 1);
}

const WEEKENDS = new Set([6, 0]);
const EXEMPT_IDS = new Set(['11', '18']);

function parseHms(str) {
    if (!str || !str.includes(':')) return 0;
    const parts = str.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function fmtHms(totalMin) {
    if (totalMin <= 0) return '00:00';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

function fmtDate(d) {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function main() {
    console.log('A processar dados para HTML e CSV...');
    const summaryRaw = fs.readFileSync(SUMMARY_FILE, 'utf8');
    const recordsRaw = fs.readFileSync(RECORDS_FILE, 'utf8');

    const employees = {};

    // 1. Summary Parsing
    const trs = summaryRaw.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    trs.forEach(tr => {
        const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
        const cells = tds.map(td => td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim());
        let idIdx = cells.findIndex(c => c && !isNaN(parseInt(c)) && parseInt(c) < 100);
        if (idIdx === -1) return;

        const id = cells[idIdx];
        const name = cells[idIdx + 1];
        if (!name || name.length < 3) return;

        const emp = { id, name, days: {} };
        employees[id] = emp;

        ALL_DATES.forEach((date, i) => {
            const key = date.toISOString().split('T')[0];
            const val = cells[8 + i] || '00:00';
            emp.days[key] = { total: val, punches: [] };
        });
    });

    // 2. Records Parsing
    const rTds = recordsRaw.match(/<td[\s\S]*?<\/td>/gi) || [];
    let curId = null, curDate = null;
    rTds.forEach(td => {
        let v = td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
        if (!v) return;
        if (v.match(/^\d+-/)) { curId = v.split('-')[0].trim(); curDate = null; }
        else if (v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)) {
            const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            curDate = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
        } else if (v.match(/^\d{1,2}:\d{2}$/) && curId && curDate && employees[curId]) {
            if (!employees[curId].days[curDate]) employees[curId].days[curDate] = { total: '00:00', punches: [] };
            employees[curId].days[curDate].punches.push(v);
        }
    });

    const sortedIds = Object.keys(employees).sort((a, b) => parseInt(a) - parseInt(b));

    // 3. HTML Build
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 15px; color: #222; }
  .page { page-break-after: always; padding-bottom: 20px; }
  h1 { color: #1e3a8a; font-size: 17px; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #1e3a8a; color: #fff; padding: 4px; }
  td { border: 1px solid #cbd5e1; padding: 3px; text-align: center; }
  .total-row td { font-weight: bold; background: #eff6ff; border-top: 2px solid #1e3a8a; }
  .note { padding: 10px; background: #f0f9ff; border-left: 4px solid #3b82f6; margin: 10px 0; }
  .sigs { display: flex; justify-content: space-around; margin-top: 30px; }
  .sig { width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 5px; }
</style></head><body>`;

    // 4. CSV Init (BOM for Excel)
    let csv = '\uFEFFDate;Employee;ID;Entry;Exit;Duration;Extra;Exempt_Note\n';

    for (const id of sortedIds) {
        const emp = employees[id];
        let totalOtMin = 0, totalWorkMin = 0;
        let rows = '';

        ALL_DATES.forEach(d => {
            const key = d.toISOString().split('T')[0];
            const data = emp.days[key] || { total: '00:00', punches: [] };
            
            let entry = '-', exit = '-';
            if (data.punches.length >= 2) {
                const s = data.punches.slice().sort((a,b) => parseHms(a) - parseHms(b));
                entry = s[0]; exit = s[s.length-1];
            } else if (data.punches.length === 1) { entry = data.punches[0]; }

            const durMin = parseHms(data.total);
            totalWorkMin += durMin;

            let extraMin = Math.max(0, durMin - 480);
            totalOtMin += extraMin;

            rows += `<tr><td>${fmtDate(d)}</td><td>${entry}</td><td>${exit}</td><td>${data.total}</td><td>${fmtHms(extraMin)}</td></tr>`;
            csv += `${fmtDate(d)};${emp.name};${id};${entry};${exit};${data.total};${fmtHms(extraMin)};\n`;
        });

        const exemptNote = EXEMPT_IDS.has(id) ? `Exemption applied (20h threshold). Pay: ${fmtHms(Math.max(0, totalOtMin - 1200))}` : '-';
        csv += `TOTAL;${emp.name};${id};-;-;${fmtHms(totalWorkMin)};${fmtHms(totalOtMin)};${exemptNote}\n\n`;

        html += `<div class="page">
          <h1>Relatório Assiduidade — Gengibre</h1>
          <p><strong>Colaborador:</strong> ${emp.name} (ID: ${id})</p>
          <table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Extra</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="total-row"><td colspan="3" style="text-align:right">TOTAL:</td><td>${fmtHms(totalWorkMin)}</td><td>${fmtHms(totalOtMin)}</td></tr></tfoot>
          </table>`;
        
        if (EXEMPT_IDS.has(id)) {
            const pay = Math.max(0, totalOtMin - 1200);
            html += `<div class="note"><strong>Isenção (20h):</strong> Total Extra: ${fmtHms(totalOtMin)}. A pagar: ${fmtHms(pay)}</div>`;
        }
        html += `<div class="sigs"><div class="sig">Colaborador</div><div class="sig">Responsável</div></div></div>`;
    }

    html += '</body></html>';
    fs.writeFileSync(path.join(OUTPUT_DIR, 'Relatorio_Gengibre_Final.html'), html, 'utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'Relatorio_Gengibre_Final.csv'), csv, 'utf8');
    console.log('Relatórios HTML e CSV gerados com sucesso!');
}

main();
