const fs = require('fs');
const path = require('path');

const RECORDS_FILE = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios', 'Records_AllDepts_260331_to_260430_7679 (1).xls');
const OUTPUT_DIR   = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios');

const START_DATE = new Date('2026-03-31T00:00:00Z');
const END_DATE   = new Date('2026-04-30T00:00:00Z');

const ALL_DATES = [];
let curr = new Date(START_DATE);
while (curr <= END_DATE) {
    ALL_DATES.push(new Date(curr));
    curr.setUTCDate(curr.getUTCDate() + 1);
}

const WEEKENDS = new Set([6, 0]);

function parseHms(str) {
    if (!str || !str.includes(':')) return 0;
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
}

function fmtHms(totalMin) {
    if (totalMin <= 0) return '-';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h${String(m).padStart(2, '0')}m`;
}

function fmtDate(d) {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function main() {
    console.log('Gerando relatório consolidado VP (Padrão 8h)...');
    const content = fs.readFileSync(RECORDS_FILE, 'utf8');

    const cellRegex = /<td[^>]*>(.*?)<\/td>/gi;
    const employees = {};
    let currentEmp = null;
    let currentDate = null;

    let match;
    while ((match = cellRegex.exec(content)) !== null) {
        let val = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
        if (!val) continue;

        const empMatch = val.match(/^(\d+)\s*-\s*(.*)$/);
        if (empMatch) {
            const id = empMatch[1].trim();
            const name = empMatch[2].trim();
            
            // Exclude JULIO (ID 8) from VP reports
            if (id === '8' || name.toUpperCase().includes('JULIO')) {
                currentEmp = null;
                continue;
            }

            currentEmp = { id, name, days: {} };
            employees[id] = currentEmp;
            currentDate = null;
            continue;
        }

        // VP Date format: MM/DD/YYYY
        const dateMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
            // match[1] = Month, match[2] = Day, match[3] = Year
            currentDate = `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
            if (currentEmp && !currentEmp.days[currentDate]) {
                currentEmp.days[currentDate] = [];
            }
            continue;
        }

        if (val.match(/^\d{1,2}:\d{2}$/) && currentEmp && currentDate) {
            currentEmp.days[currentDate].push(val);
        }
    }

    const sortedIds = Object.keys(employees).sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`Encontrados ${sortedIds.length} colaboradores na VP.`);

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 15px; color: #222; }
  .page { page-break-after: always; padding-bottom: 20px; border-bottom: 1px dashed #ccc; margin-bottom: 20px; }
  .page:last-child { page-break-after: avoid; border-bottom: none; }
  h1 { color: #1e3a8a; font-size: 18px; margin: 0 0 5px; }
  .meta { color: #444; margin-bottom: 10px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #1e3a8a; color: #fff; padding: 4px; border: 1px solid #1e3a8a; }
  td { border: 1px solid #cbd5e1; padding: 3px; text-align: center; }
  .wknd td { background: #f8fafc; color: #94a3b8; }
  .total-row td { font-weight: bold; background: #eff6ff; border-top: 2px solid #1e3a8a; }
  .sigs { display: flex; justify-content: space-around; margin-top: 40px; }
  .sig { width: 42%; text-align: center; border-top: 1px solid #333; padding-top: 5px; font-weight: bold; }
  .no-print { text-align:center; background:#f0f9ff; padding:15px; border-radius:8px; margin-bottom:20px; border: 1px solid #bae6fd; }
  .no-print button { padding:10px 25px; font-size:14px; background:#0284c7; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; }
  @media print { .no-print { display:none; } .page { border-bottom: none; } }
</style></head><body>
<div class="no-print">
  <h2 style="margin:0 0 10px;color:#0369a1;">Relatório de Assiduidade — Villa Peixoto</h2>
  <button onclick="window.print()">🖨️ Gerar PDF / Imprimir</button>
</div>`;

    let csv = '\uFEFFDate;Employee;ID;Entry;Exit;Duration;Extra\n';

    for (const id of sortedIds) {
        const emp = employees[id];
        let totalWorkMin = 0, totalOtMin = 0;
        let tableRows = '';

        ALL_DATES.forEach(d => {
            const key = d.toISOString().split('T')[0];
            const punches = emp.days[key] || [];
            const isWk = WEEKENDS.has(d.getUTCDay());
            
            let entry = '-', exit = '-', duration = '-', ot = '-';
            if (punches.length >= 2) {
                const s = punches.slice().sort((a,b) => parseHms(a) - parseHms(b));
                entry = s[0]; exit = s[s.length-1];
                let dur = parseHms(exit) - parseHms(entry);
                if (dur > 360) dur -= 60; // Lunch
                totalWorkMin += dur;
                duration = `${Math.floor(dur/60)}h${String(dur%60).padStart(2,'0')}m`;
                
                if (dur > 480) { // Strict 8h
                    const extra = dur - 480;
                    totalOtMin += extra;
                    ot = `+${Math.floor(extra/60)}h${String(extra%60).padStart(2,'0')}m`;
                }
            } else if (punches.length === 1) { entry = punches[0]; }

            tableRows += `<tr${isWk && entry === '-' ? ' class="wknd"' : ''}>`
                       + `<td>${fmtDate(d)}</td><td>${entry}</td><td>${exit}</td>`
                       + `<td>${duration}</td><td>${ot}</td></tr>`;
            csv += `${fmtDate(d)};${emp.name};${id};${entry};${exit};${duration};${ot}\n`;
        });

        const totalWorkStr = `${Math.floor(totalWorkMin/60)}h${String(totalWorkMin%60).padStart(2,'0')}m`;
        const totalOtStr = fmtHms(totalOtMin);

        html += `<div class="page">
  <h1>Pontual | Villa Peixoto</h1>
  <div class="meta"><strong>Colaborador:</strong> ${emp.name} (ID: ${id}) | <strong>Período:</strong> 31/03 a 30/04</div>
  <table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Horas Extra</th></tr></thead>
  <tbody>${tableRows}</tbody>
  <tfoot><tr class="total-row"><td colspan="3" style="text-align:right">TOTAL DO PERÍODO:</td><td>${totalWorkStr}</td><td>${totalOtStr}</td></tr></tfoot>
  </table>
  <div class="sigs"><div class="sig">Assinatura do Colaborador</div><div class="sig">Assinatura do Responsável</div></div></div>`;
        csv += `TOTAL;${emp.name};${id};-;-;${totalWorkStr};${totalOtStr}\n\n`;
    }

    html += '</body></html>';
    fs.writeFileSync(path.join(OUTPUT_DIR, 'Relatorio_VP_Final.html'), html, 'utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'Relatorio_VP_Final.csv'), csv, 'utf8');
    console.log('Relatórios VP gerados com sucesso!');
}

main();
