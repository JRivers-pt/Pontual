const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

const RAW_RECORDS_FILE = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios', 've_october_raw_records.json');
const OUTPUT_DIR = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios');
const ARTIFACT_DIR = path.join('C:', 'Users', 'JD', '.gemini', 'antigravity', 'brain', '4742dea8-2d18-4780-8fe0-093e9cd04c39');

const START_DATE_STR = '2026-10-01';
const END_DATE_STR = '2026-10-31';

const knownRoster = {
    '1': 'José Vaz',
    '3': 'Isabel Vaz',
    '4': 'Cláudia Fernandes',
    '5': 'Humberto Silva',
    '6': 'Duarte Pestana',
    '7': 'Cristiana Machado',
    '8': 'Mauro Baião',
    '9': 'Michael Sales',
    '10': 'Bruno Lourenço'
};

function parseMinutes(str) {
    if (!str || !str.includes(':')) return 0;
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
}

function fmtHms(min) {
    if (!min || min <= 0) return '-';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${String(m).padStart(2, '0')}m`;
}

// Subtrai 1 hora (-60 min) a partir de 25/10/2026 às 02:00:00
function adjustChecktime(rawChecktime) {
    const clean = String(rawChecktime).replace(/([+-]\d{2}:\d{2}|Z)$/, '').replace(' ', 'T');
    const dateKey = clean.slice(0, 10);
    let [h, m] = clean.slice(11, 16).split(':').map(Number);
    
    let isAdjusted = false;
    if (dateKey > '2026-10-25' || (dateKey === '2026-10-25' && h >= 2)) {
        h = (h - 1 + 24) % 24;
        isAdjusted = true;
    }
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return { dateKey, timeStr, isAdjusted, origTime: clean.slice(11, 16) };
}

function htmlSafe(str) {
    if (!str) return '';
    return str
        .replace(/á/g, '&aacute;').replace(/à/g, '&agrave;').replace(/ã/g, '&atilde;').replace(/â/g, '&acirc;')
        .replace(/é/g, '&eacute;').replace(/ê/g, '&ecirc;')
        .replace(/í/g, '&iacute;')
        .replace(/ó/g, '&oacute;').replace(/ô/g, '&ocirc;').replace(/õ/g, '&otilde;')
        .replace(/ú/g, '&uacute;')
        .replace(/ç/g, '&ccedil;')
        .replace(/Á/g, '&Aacute;').replace(/É/g, '&Eacute;').replace(/Í/g, '&Iacute;')
        .replace(/Ó/g, '&Oacute;').replace(/Ú/g, '&Uacute;').replace(/Ç/g, '&Ccedil;');
}

async function main() {
    console.log('=== A gerar Relatório de Assiduidade VE (Outubro 2026 com Ajuste DST) ===');

    if (!fs.existsSync(RAW_RECORDS_FILE)) {
        throw new Error(`Ficheiro de dados não encontrado: ${RAW_RECORDS_FILE}`);
    }

    const records = JSON.parse(fs.readFileSync(RAW_RECORDS_FILE, 'utf8'));
    console.log(`Carregados ${records.length} registos brutos.`);

    // 1. Organizar picagens por funcionário
    const employees = {};
    records.forEach(r => {
        const w = r.employee?.workno;
        if (!w) return;
        if (!employees[w]) {
            employees[w] = {
                id: w,
                name: knownRoster[w] || ((r.employee?.first_name || '') + ' ' + (r.employee?.last_name || '')).trim(),
                dept: r.employee?.department || 'VE',
                title: r.employee?.job_title || '',
                days: {}
            };
        }
        const adj = adjustChecktime(r.checktime);
        if (!employees[w].days[adj.dateKey]) {
            employees[w].days[adj.dateKey] = [];
        }
        employees[w].days[adj.dateKey].push({
            timeStr: adj.timeStr,
            origTime: adj.origTime,
            isAdjusted: adj.isAdjusted
        });
    });

    // 2. Definir os 31 dias de Outubro de 2026
    const allDates = [];
    for (let d = 1; d <= 31; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateKey = `2026-10-${dayStr}`;
        const dt = new Date(`2026-10-${dayStr}T12:00:00Z`);
        const isWeekend = (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
        allDates.push({ dateKey, dateStr: `${dayStr}/10/2026`, isWeekend });
    }

    const sortedIds = Object.keys(employees).sort((a, b) => Number(a) - Number(b));
    console.log(`Colaboradores a processar: ${sortedIds.length}`);

    // --- HTML STYLES & SETUP ---
    const css = `
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; }
.page { background: #fff; width: 210mm; min-height: 297mm; padding: 25px 30px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px; }
.header-info h1 { color: #1e3a8a; font-size: 22px; margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
.header-info p { margin: 3px 0 0; color: #64748b; font-size: 12px; font-weight: 500; }
.emp-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; gap: 35px; border-left: 4px solid #1e3a8a; }
.emp-box strong { color: #1e3a8a; text-transform: uppercase; font-size: 9px; display: block; margin-bottom: 2px; }
.emp-box span { font-size: 13px; font-weight: 600; color: #0f172a; }
table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
th { background: #1e3a8a; color: #fff; padding: 7px 6px; font-size: 9px; border: 1px solid #1e3a8a; text-transform: uppercase; letter-spacing: 0.3px; }
td { padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; }
.total-row { background: #eff6ff; font-weight: 700; color: #1e3a8a; border-top: 2px solid #1e3a8a; }
.total-row td { padding: 7px 6px; }
.obs { color: #d97706; font-weight: 600; font-size: 9px; }
.dst-tag { font-size: 8px; color: #2563eb; background: #dbeafe; padding: 1px 4px; border-radius: 3px; margin-left: 3px; font-weight: 600; }
.sigs { display: flex; justify-content: space-between; margin-top: 35px; padding: 0 20px; }
.sig { width: 220px; text-align: center; border-top: 1px solid #1e293b; padding-top: 6px; font-weight: 600; font-size: 10px; color: #334155; }
.no-print { text-align: center; padding: 15px; margin-bottom: 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; }
.no-print button { padding: 10px 20px; background: #1e3a8a; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 13px; }
@media print {
  .no-print { display: none !important; }
  body { background: none; padding: 0; margin: 0; }
  .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; min-height: 297mm; padding: 20mm 15mm; }
}
`;

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style><title>Relatório de Assiduidade — VE Outubro 2026</title></head><body>`;
    html += `<div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>`;

    let csv = '\uFEFFsep=;\nRelatório de Assiduidade - VE (Vontade e Empenho)\nPeríodo: 01/10/2026 a 31/10/2026\n\n';

    // Para Excel (.xlsx)
    const wb = XLSX.utils.book_new();
    const summaryRows = [];
    summaryRows.push(['ID', 'Colaborador', 'Departamento', 'Cargo', 'Dias Trabalhados', 'Total Horas', 'Horas Extra']);

    const fullReportData = {};

    sortedIds.forEach(id => {
        const emp = employees[id];
        let totalWorkMin = 0;
        let totalOtMin = 0;
        let daysWorked = 0;
        let tableRowsHtml = '';

        csv += `Colaborador: ${emp.name} (${id})\n`;
        csv += `Data;Entrada;Almoço;Saída;Total;Extra;Obs\n`;

        const empSheetRows = [
            ['Pontual | VE - Relatório de Assiduidade Mensal'],
            [`Colaborador: ${emp.name}`, `ID: ${id}`, `Período: 01/10/2026 a 31/10/2026`],
            [],
            ['Data', 'Entrada', 'Almoço', 'Saída', 'Total', 'Extra', 'Observações']
        ];

        const daysDetails = [];

        allDates.forEach(d => {
            const rawPunches = emp.days[d.dateKey] || [];
            rawPunches.sort((a, b) => parseMinutes(a.timeStr) - parseMinutes(b.timeStr));

            // Deduplicação < 15min
            const valid = [];
            rawPunches.forEach(p => {
                if (valid.length === 0) {
                    valid.push(p);
                } else {
                    const prev = parseMinutes(valid[valid.length - 1].timeStr);
                    const cur = parseMinutes(p.timeStr);
                    if (cur - prev >= 15) {
                        valid.push(p);
                    }
                }
            });

            let e1 = '-', s1 = '-', e2 = '-', s2 = '-', duration = '-', ot = '-', obs = '', obsCsv = '';
            let dur = 0;
            const pc = valid.length;

            if (pc >= 4) {
                e1 = valid[0].timeStr;
                s1 = valid[1].timeStr;
                e2 = valid[2].timeStr;
                s2 = valid[valid.length - 1].timeStr;
                dur = (parseMinutes(s1) - parseMinutes(e1)) + (parseMinutes(s2) - parseMinutes(e2));
            } else if (pc === 3) {
                e1 = valid[0].timeStr;
                s1 = valid[1].timeStr;
                e2 = valid[2].timeStr;
                dur = parseMinutes(s1) - parseMinutes(e1);
                obs = 'Falta picagem (Almoço)';
                obsCsv = obs;
            } else if (pc === 2) {
                e1 = valid[0].timeStr;
                s2 = valid[1].timeStr;
                dur = parseMinutes(s2) - parseMinutes(e1);
                if (dur > 360) {
                    dur -= 60;
                    obs = 'Falta break de almoço / Dedução 1h';
                    obsCsv = obs;
                }
            } else if (pc === 1) {
                const pMin = parseMinutes(valid[0].timeStr);
                if (pMin < 780) {
                    e1 = valid[0].timeStr;
                    obs = 'Falta saída';
                    obsCsv = obs;
                } else {
                    s2 = valid[0].timeStr;
                    obs = 'Falta entrada';
                    obsCsv = obs;
                }
            }

            if (dur > 0) {
                daysWorked++;
                totalWorkMin += dur;
                duration = fmtHms(dur);
                if (dur >= 486) {
                    const extra = dur - 485;
                    totalOtMin += extra;
                    ot = `+${fmtHms(extra)}`;
                }
            } else if (pc === 1) {
                daysWorked++;
            }

            const isWk = d.isWeekend;
            const rowStyle = (isWk && e1 === '-') ? 'style="background:#f1f5f9;color:#94a3b8;"' : '';
            const almoco = (s1 !== '-' || e2 !== '-') ? `${s1} - ${e2}` : '-';
            const obsSpan = obs ? `<span class="obs">${htmlSafe(obs)}</span>` : '';

            // Se for do período de 26 a 30 de Outubro, registrar indicador de ajuste DST
            const wasAdjusted = valid.some(p => p.isAdjusted);
            const dstIndicator = wasAdjusted ? `<span class="dst-tag" title="Picagem ajustada em -1h (compensação DST)">-1h DST</span>` : '';

            tableRowsHtml += `<tr ${rowStyle}>
                <td>${d.dateStr}</td>
                <td>${e1 !== '-' ? e1 + (wasAdjusted && e1 !== '-' ? dstIndicator : '') : '-'}</td>
                <td>${almoco}</td>
                <td>${s2 !== '-' ? s2 + (wasAdjusted && s2 !== '-' ? dstIndicator : '') : '-'}</td>
                <td>${duration}</td>
                <td>${ot}</td>
                <td>${obsSpan}</td>
            </tr>`;

            csv += `${d.dateStr};${e1};${almoco};${s2};${duration};${ot};${obsCsv}\n`;

            empSheetRows.push([
                d.dateStr,
                e1,
                almoco,
                s2,
                duration,
                ot,
                obs + (wasAdjusted ? ' [Ajuste -1h DST aplicado]' : '')
            ]);

            daysDetails.push({
                dateStr: d.dateStr,
                dateKey: d.dateKey,
                isWeekend: isWk,
                entry: e1,
                lunch: almoco,
                exit: s2,
                duration,
                extra: ot,
                obs,
                wasAdjusted
            });
        });

        const totalWorkStr = fmtHms(totalWorkMin);
        const totalOtStr = fmtHms(totalOtMin);

        html += `
        <div class="page">
            <div class="header">
                <div class="header-info">
                    <h1>Pontual | VE</h1>
                    <p>Relatório de Assiduidade Mensal</p>
                </div>
            </div>
            <div class="emp-box">
                <div><strong>Colaborador</strong><span>${htmlSafe(emp.name)}</span></div>
                <div><strong>ID</strong><span>${id}</span></div>
                <div><strong>Período</strong><span>01/10/2026 a 31/10/2026</span></div>
                <div><strong>Dias Trabalhados</strong><span>${daysWorked}</span></div>
            </div>
            <table>
                <thead>
                    <tr><th>Data</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Total</th><th>Extra</th><th>Obs</th></tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="4" style="text-align:right">TOTAL DO PERÍODO:</td>
                        <td>${totalWorkStr}</td>
                        <td>${totalOtStr}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <div class="sigs">
                <div class="sig">Assinatura do Colaborador</div>
                <div class="sig">Assinatura do Responsável</div>
            </div>
        </div>`;

        csv += `TOTAL DO PERÍODO;;;;${totalWorkStr};${totalOtStr};\n\n`;

        empSheetRows.push([]);
        empSheetRows.push(['TOTAL DO PERÍODO', '', '', '', totalWorkStr, totalOtStr, '']);

        // Adicionar folha do colaborador no Excel
        const safeSheetName = `${id}_${emp.name.split(' ')[0]}`.substring(0, 31);
        const ws = XLSX.utils.aoa_to_sheet(empSheetRows);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

        summaryRows.push([
            id,
            emp.name,
            emp.dept,
            emp.title,
            daysWorked,
            totalWorkStr,
            totalOtStr
        ]);

        fullReportData[id] = {
            id,
            name: emp.name,
            dept: emp.dept,
            title: emp.title,
            daysWorked,
            totalWorkStr,
            totalOtStr,
            days: daysDetails
        };
    });

    html += `</body></html>`;

    // Criar folha de resumo no início do Excel
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    wb.SheetNames.unshift('Resumo Geral');
    wb.Sheets['Resumo Geral'] = summaryWs;

    // 1. Gravar HTML
    const htmlPath = path.join(OUTPUT_DIR, 'Relatorio_VE_Outubro_2026.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML gerado: ${htmlPath}`);

    // 2. Gravar CSV
    const csvPath = path.join(OUTPUT_DIR, 'Relatorio_VE_Outubro_2026.csv');
    fs.writeFileSync(csvPath, csv, 'utf8');
    console.log(`✅ CSV gerado: ${csvPath}`);

    // 3. Gravar XLSX
    const xlsxPath = path.join(OUTPUT_DIR, 'Relatorio_VE_Outubro_2026.xlsx');
    XLSX.writeFile(wb, xlsxPath);
    console.log(`✅ Excel (.xlsx) gerado: ${xlsxPath}`);

    // 4. Gravar JSON com os dados completos para widgets/UI
    const jsonPath = path.join(OUTPUT_DIR, 'Relatorio_VE_Outubro_2026.json');
    fs.writeFileSync(jsonPath, JSON.stringify(fullReportData, null, 2), 'utf8');
    console.log(`✅ JSON dos dados gerado: ${jsonPath}`);

    // 5. Gerar PDF com Chrome
    const pdfPath = path.join(OUTPUT_DIR, 'Relatorio_VE_Outubro_2026.pdf');
    console.log('A converter HTML para PDF via Chrome headless...');
    try {
        const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const cmd = `"${chromeExe}" --headless --disable-gpu --print-to-pdf="${pdfPath}" --no-pdf-header-footer "file:///${htmlPath.replace(/\\/g, '/')}"`;
        execSync(cmd, { stdio: 'inherit' });
        console.log(`✅ PDF gerado com sucesso: ${pdfPath}`);
    } catch (e) {
        console.error('Falha ao gerar PDF via Chrome:', e.message);
    }

    // 6. Gerar Screenshot de Preview para Artifact / Chat
    const previewPngPath = path.join(ARTIFACT_DIR, 'preview_ve_outubro_p1.png');
    console.log('A gerar Screenshot de pré-visualização...');
    try {
        const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        const cmdScreenshot = `"${chromeExe}" --headless --disable-gpu --screenshot="${previewPngPath}" --window-size=1200,1650 "file:///${htmlPath.replace(/\\/g, '/')}"`;
        execSync(cmdScreenshot, { stdio: 'inherit' });
        console.log(`✅ Screenshot gerado: ${previewPngPath}`);
    } catch (e) {
        console.error('Falha ao gerar Screenshot:', e.message);
    }

    console.log('=== Processo concluído com sucesso! ===');
}

main().catch(console.error);
