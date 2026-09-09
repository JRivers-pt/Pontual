/**
 * Gerador de Relatorios de Assiduidade CMB
 * Mesmo layout profissional dos relatorios Gengibre
 * Lê dados diretamente do Supabase (Neon) + informacao de horarios do JSON local
 *
 * Uso:
 *   node generate_cmb_report.js 2026-09-01 2026-09-30
 *   node generate_cmb_report.js 2026-09-01 2026-09-30 "0083"    <- apenas 1 colaborador
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const DATABASE_URL = 'postgresql://neondb_owner:npg_pRg4UkDoItN0@ep-divine-queen-abc5fzem-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15';
const CMB_USER_ID  = 'cmtiirk2q0000ujb09w1ss4hr';
const OUTPUT_DIR   = 'C:\\Users\\JD\\Documents\\Pontual\\Relatorios';
const EMPLOYEE_JSON = 'C:\\Users\\JD\\Desktop\\cmb\\colaboradores_cmb.json';

const args = process.argv.slice(2);
const startDateStr = args[0] || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
const endDateStr   = args[1] || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
const filterWorkno = args[2] || null;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function toMin(hhmm) {
  if (!hhmm || hhmm === '-') return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtHm(totalMin) {
  if (totalMin <= 0) return '-';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

function fmtTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function dateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${mo}-${dd}`;
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

// Parse do horario: "H6 - 08:00 - 11:00 - 12:00 - 17:00" -> { times: [...], expectedMin: N }
function parseSchedule(scheduleName) {
  if (!scheduleName || scheduleName === 'N/A') return { times: [], expectedMin: 480 };
  const times = (scheduleName.match(/\d{2}:\d{2}/g) || []);
  let expectedMin = 480; // default 8h
  if (times.length >= 4) {
    // e1 s1 e2 s2 -> (s1-e1) + (s2-e2)
    expectedMin = (toMin(times[1]) - toMin(times[0])) + (toMin(times[3]) - toMin(times[2]));
  } else if (times.length === 2) {
    // horario continuo -> subtrai 1h almoco
    expectedMin = toMin(times[1]) - toMin(times[0]) - 60;
  }
  return { times, expectedMin };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS (identico ao layout Gengibre)
// ─────────────────────────────────────────────────────────────────────────────
const css = `
  body { font-family: 'Segoe UI', sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; }
  .page { background: #fff; width: 210mm; min-height: 297mm; padding: 20px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; }
  .header-info h1 { color: #1e3a8a; font-size: 24px; margin: 0; font-weight: 800; text-transform: uppercase; }
  .header-info p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
  .emp-box { background: #f1f5f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; gap: 40px; border-left: 4px solid #1e3a8a; flex-wrap: wrap; }
  .emp-box strong { color: #1e3a8a; text-transform: uppercase; font-size: 10px; display: block; }
  .emp-box span { font-size: 13px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a8a; color: #fff; padding: 9px 8px; font-size: 9px; border: 1px solid #1e3a8a; text-align: center; }
  td { padding: 7px 8px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; }
  tr:nth-child(even) td { background: #fafafa; }
  .weekend td { background: #f1f5f9 !important; color: #94a3b8; }
  .total-row td { background: #eff6ff !important; font-weight: 700; color: #1e3a8a; }
  .obs { color: #d97706; font-weight: 600; font-size: 9px; }
  .obs-falha { color: #dc2626; font-weight: 600; font-size: 9px; }
  .schedule-box { margin-bottom: 12px; padding: 8px 12px; background: #f0f9ff; border-left: 3px solid #0284c7; font-size: 10px; color: #0369a1; border-radius: 4px; }
  .footer-sign { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
  .footer-sign .sign { border-top: 1px solid #cbd5e1; padding-top: 6px; min-width: 200px; text-align: center; }
  @media print {
    body { background: none; padding: 0; margin: 0; }
    .no-print { display: none !important; }
    .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Gerando Relatorio CMB: ${startDateStr} a ${endDateStr}`);
  if (filterWorkno) console.log(`   Filtro colaborador: ${filterWorkno}`);

  // 1. Carregar lista de colaboradores + horarios
  if (!fs.existsSync(EMPLOYEE_JSON)) {
    console.error(`❌ Ficheiro ${EMPLOYEE_JSON} nao encontrado. Corre primeiro generate_employee_list.js`);
    process.exit(1);
  }
  const employees = JSON.parse(fs.readFileSync(EMPLOYEE_JSON, 'utf8'));
  const empMap = {};
  employees.forEach(e => {
    empMap[String(e.reg_number)] = e;
  });

  // 2. Ligar ao Supabase/Neon e buscar picagens
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('✅ Ligado ao Supabase (Neon)');

  const startDate = new Date(startDateStr + 'T00:00:00Z');
  const endDate   = new Date(endDateStr   + 'T23:59:59Z');

  let query = `
    SELECT workno, "employeeName", checktime, checktype, "deviceName"
    FROM "AttendanceLog"
    WHERE "userId" = $1
      AND checktime >= $2
      AND checktime <= $3
    ORDER BY workno, checktime ASC
  `;
  const params = [CMB_USER_ID, startDate, endDate];

  if (filterWorkno) {
    query = `
      SELECT workno, "employeeName", checktime, checktype, "deviceName"
      FROM "AttendanceLog"
      WHERE "userId" = $1
        AND checktime >= $2
        AND checktime <= $3
        AND workno = $4
      ORDER BY workno, checktime ASC
    `;
    params.push(filterWorkno);
  }

  const result = await client.query(query, params);
  await client.end();

  console.log(`📊 ${result.rows.length} picagens encontradas no Supabase.`);

  if (result.rows.length === 0) {
    console.log('⚠️  Sem picagens no periodo. Verifica se o Agente ja sincronizou.');
    process.exit(0);
  }

  // 3. Agrupar por colaborador e por dia
  const byWorkno = {};
  result.rows.forEach(row => {
    const wn = String(row.workno);
    if (!byWorkno[wn]) byWorkno[wn] = { days: {} };
    const dk = dateKey(row.checktime);
    if (!byWorkno[wn].days[dk]) byWorkno[wn].days[dk] = [];
    byWorkno[wn].days[dk].push(fmtTime(row.checktime));
  });

  // 4. Gerar relatorio
  const periodLabel = `${startDateStr.split('-').reverse().join('/')} a ${endDateStr.split('-').reverse().join('/')}`;
  const safeStartDate = new Date(startDateStr + 'T12:00:00');
  const safeEndDate   = new Date(endDateStr   + 'T12:00:00');

  let html = `<html><head><meta charset="UTF-8"><title>Relatorio CMB</title><style>${css}</style></head><body>`;
  html += `<div class="no-print" style="text-align:center;padding:20px">
    <button onclick="window.print()" style="padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px">
      🖨️ Gerar PDF / Imprimir
    </button>
  </div>`;

  let csvContent = `sep=;\r\nRelatorio de Assiduidade - Colegio Maristas de Braga (CMB)\r\nPeriodo: ${periodLabel}\r\n\r\n`;

  const sortedWorknos = Object.keys(byWorkno).sort((a, b) => parseInt(a) - parseInt(b));
  let pagesGenerated = 0;

  for (const wn of sortedWorknos) {
    const empInfo = empMap[wn] || { name: `Colaborador ${wn}`, schedule_name: 'N/A', schedule_code: '-' };
    const { times: schedTimes, expectedMin } = parseSchedule(empInfo.schedule_name);
    const wkData = byWorkno[wn];

    let tableRows = '';
    let totalWorkMin = 0;
    let totalOtMin = 0;
    let totalAbsenceDays = 0;
    let csvRows = '';

    let curr = new Date(safeStartDate);
    while (curr <= safeEndDate) {
      const dk = dateKey(curr);
      const isWk = isWeekend(dk);
      const dayPunches = (wkData.days[dk] || []).slice().sort((a, b) => toMin(a) - toMin(b));

      // Deduplicar picagens com menos de 5 min de diferenca
      const validPunches = [];
      for (const p of dayPunches) {
        if (validPunches.length === 0) {
          validPunches.push(p);
        } else {
          const prev = toMin(validPunches[validPunches.length - 1]);
          if (toMin(p) - prev >= 5) validPunches.push(p);
        }
      }

      let e1 = '-', s1 = '-', e2 = '-', s2 = '-';
      let duration = '-', ot = '-';
      let obs = '';
      let dur = 0;
      const pc = validPunches.length;

      if (!isWk || pc > 0) {
        if (pc >= 4) {
          e1 = validPunches[0]; s1 = validPunches[1];
          e2 = validPunches[2]; s2 = validPunches[pc - 1];
          dur = (toMin(s1) - toMin(e1)) + (toMin(s2) - toMin(e2));
          if (pc > 4) obs = `${pc} picagens (extra)`;
        } else if (pc === 3) {
          e1 = validPunches[0]; s1 = validPunches[1]; s2 = validPunches[2];
          dur = (toMin(s1) - toMin(e1));
          obs = 'Falta picagem (Almoco)';
        } else if (pc === 2) {
          e1 = validPunches[0]; s2 = validPunches[1];
          dur = toMin(s2) - toMin(e1);
          if (dur > 360) {
            dur -= 60;
            obs = 'Falta break almoco / Deducao 1h';
          }
        } else if (pc === 1) {
          const pMin = toMin(validPunches[0]);
          if (pMin < 780) { e1 = validPunches[0]; obs = 'Falta saida'; }
          else             { s2 = validPunches[0]; obs = 'Falta entrada'; }
        } else if (!isWk) {
          obs = 'Ausencia';
          totalAbsenceDays++;
        }

        if (dur > 0) {
          totalWorkMin += dur;
          duration = fmtHm(dur);
          const extra = dur - expectedMin;
          if (extra > 0) {
            totalOtMin += extra;
            ot = `+${fmtHm(extra)}`;
          } else if (extra < -5) {
            ot = fmtHm(extra); // saiu mais cedo
          }
        }
      }

      const almoco = (s1 !== '-' || e2 !== '-') ? `${s1} - ${e2}` : '-';
      const displayDate = `${String(curr.getDate()).padStart(2,'0')}/${String(curr.getMonth()+1).padStart(2,'0')}/${curr.getFullYear()}`;
      const wkClass = isWk && pc === 0 ? ' class="weekend"' : '';
      const obsHtml = obs
        ? (obs.includes('Ausencia') || obs.includes('Falta')
          ? `<span class="obs-falha">${obs}</span>`
          : `<span class="obs">${obs}</span>`)
        : '';

      tableRows += `<tr${wkClass}><td>${displayDate}</td><td>${e1}</td><td>${almoco}</td><td>${s2}</td><td>${duration}</td><td>${ot}</td><td>${obsHtml}</td></tr>`;
      csvRows   += `${displayDate};${e1};${almoco};${s2};${duration};${ot};${obs}\r\n`;

      curr.setDate(curr.getDate() + 1);
    }

    // ── Página HTML deste colaborador ──
    const scheduleLabel = empInfo.schedule_name && empInfo.schedule_name !== 'N/A'
      ? `Horário ${empInfo.schedule_code}: ${empInfo.schedule_name}`
      : 'Sem horário definido';

    html += `<div class="page">`;
    html += `<div class="header">
      <div class="header-info">
        <h1>Pontual | Colégio Manuel Bernardes</h1>
        <p>Relatório Individual de Assiduidade</p>
      </div>
      <div style="text-align:right;color:#64748b;font-size:11px;">
        <div>Gerado em ${new Date().toLocaleDateString('pt-PT')}</div>
        <div>${new Date().toLocaleTimeString('pt-PT')}</div>
      </div>
    </div>`;

    html += `<div class="emp-box">
      <div><strong>Colaborador</strong><span>${empInfo.name}</span></div>
      <div><strong>Nº Mecanográfico</strong><span>${wn}</span></div>
      <div><strong>Período</strong><span>${periodLabel}</span></div>
      <div><strong>Dias de Ausência</strong><span>${totalAbsenceDays}</span></div>
    </div>`;

    html += `<div class="schedule-box">📅 ${scheduleLabel}</div>`;

    html += `<table>
      <thead><tr>
        <th>Data</th><th>Entrada</th><th>Almoço</th><th>Saída</th>
        <th>Total</th><th>Extra/Deficit</th><th>Observações</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4" style="text-align:right">TOTAL DO PERÍODO:</td>
          <td>${fmtHm(totalWorkMin)}</td>
          <td>${totalOtMin > 0 ? '+' : ''}${fmtHm(totalOtMin)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;

    html += `<div class="footer-sign">
      <div class="sign">Colaborador / Data</div>
      <div class="sign">Responsável RH / Data</div>
    </div>`;

    html += `</div>`; // .page

    // CSV deste colaborador
    csvContent += `Colaborador: ${empInfo.name} (${wn})\r\n`;
    csvContent += `Horario: ${empInfo.schedule_name || 'N/A'}\r\n`;
    csvContent += `Data;Entrada;Almoco;Saida;Total;Extra;Obs\r\n`;
    csvContent += csvRows;
    csvContent += `TOTAL DO PERIODO;;;;${fmtHm(totalWorkMin)};${fmtHm(totalOtMin)};\r\n\r\n`;

    pagesGenerated++;
  }

  html += '</body></html>';

  // ── Guardar ficheiros ──
  const safePeriod = `${startDateStr}_a_${endDateStr}`;
  const htmlPath = path.join(OUTPUT_DIR, `Relatorio_CMB_${safePeriod}.html`);
  const csvPath  = path.join(OUTPUT_DIR, `Relatorio_CMB_${safePeriod}.csv`);
  const pdfPath  = path.join(OUTPUT_DIR, `Relatorio_CMB_${safePeriod}.pdf`);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`✅ HTML gerado: ${htmlPath}`);

  fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf8');
  console.log(`✅ CSV gerado:  ${csvPath}`);

  // PDF via Edge headless
  const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(edgeExe)) {
    try {
      execSync(`"${edgeExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`, { stdio: 'pipe' });
      if (fs.existsSync(pdfPath)) {
        console.log(`✅ PDF gerado:  ${pdfPath}`);
      }
    } catch (e) {
      console.log('⚠️  PDF via Edge falhou, usa o HTML para imprimir.');
    }
  } else {
    console.log('ℹ️  Edge nao encontrado. Abre o HTML no browser e usa Ctrl+P para gerar PDF.');
  }

  console.log(`\n🎉 Relatorio completo! ${pagesGenerated} colaboradores processados.`);
  console.log(`   Abre o HTML no browser: ${htmlPath}`);
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
