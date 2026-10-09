const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

const CROSSCHEX_API_URL = 'https://api.eu.crosschexcloud.com/';
const GENGIBRE_KEY = 'ca9605b9d17b330391a3f2e25ac6c5b1';
const GENGIBRE_SECRET = '8a19bfac316a3c3c4cab75b7a0dd7d7f';

const STIRLING_PDF_URL = 'http://127.0.0.1:8095/api/v1/convert/html/pdf';

const SMTP_CONFIG = {
    host: '127.0.0.1',
    port: 587,
    secure: false,
    auth: {
        user: 'geral@iflow.pt',
        pass: 'IflowPass2026!'
    },
    tls: {
        rejectUnauthorized: false
    }
};

const EMAIL_RECIPIENTS = {
    to: 'vasco@cozinhacriativa.pt',
    cc: 'joaodmribeiro@outlook.com',
    from: '"Pontualidade - Assiduidade" <geral@iflow.pt>'
};

const RULES = {
    exemptIds: ['11', '18'],
    skipIds: ['15'], // Excluir Gestor Admin
    overtimeToleranceMinutes: 5,
    normalDayMinutes: 480, // 8h
    lunchAutoDeductMinutes: 60,
    lunchThresholdMinutes: 360 // 6h
};

// --- DATA & PERÍODO ---
function calculatePeriod(customStart = null, customEnd = null) {
    if (customStart && customEnd) {
        return {
            startDate: new Date(customStart + 'T00:00:00'),
            endDate: new Date(customEnd + 'T23:59:59'),
            isMonthlyClose: false
        };
    }

    const today = new Date();
    const dayOfMonth = today.getDate();

    let startYear = today.getFullYear();
    let startMonth = today.getMonth(); // 0-indexed

    if (dayOfMonth < 26) {
        startMonth = startMonth - 1;
        if (startMonth < 0) {
            startMonth = 11;
            startYear -= 1;
        }
    }

    const startDate = new Date(startYear, startMonth, 26, 0, 0, 0);
    let endDate;
    let isMonthlyClose = false;

    if (dayOfMonth === 26) {
        isMonthlyClose = true;
        // Fecho mensal: do dia 26 do mês anterior ao dia 25 do mês corrente
        const prevDay = new Date(today.getFullYear(), today.getMonth(), 25, 23, 59, 59);
        endDate = prevDay;
    } else {
        // Relatório semanal (segunda-feira): acumulado até ontem (domingo) às 23:59:59
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
    }

    return { startDate, endDate, isMonthlyClose };
}

function formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDatePT(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
}

function timeStringToMinutes(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return 0;
}

function formatMinutesToHms(minutes) {
    if (minutes <= 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m.toString().padStart(2, '0')}m`;
}

function getDaysArray(startDate, endDate) {
    const arr = [];
    let curr = new Date(startDate);
    curr.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dayOfWeek = curr.getDay(); // 0 = Dom, 6 = Sab
        arr.push({
            dateKey: `${y}-${m}-${d}`,
            dateStr: `${d}/${m}/${y}`,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6
        });
        curr.setDate(curr.getDate() + 1);
    }
    return arr;
}

// --- CROSSCHEX API ---
async function fetchCrossChexRecords(startDate, endDate) {
    console.log(`[CrossChex] A autenticar...`);
    const tokenRes = await fetch(CROSSCHEX_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            header: {
                nameSpace: 'authorize.token',
                nameAction: 'token',
                version: '1.0',
                requestId: `${Date.now()}`,
                timestamp: new Date().toISOString()
            },
            payload: {
                api_key: GENGIBRE_KEY,
                api_secret: GENGIBRE_SECRET
            }
        })
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.payload?.token;
    if (!token) {
        throw new Error(`Falha ao obter token CrossChex: ${JSON.stringify(tokenData)}`);
    }

    const begin_time = `${formatDateISO(startDate)} 00:00:00`;
    const end_time = `${formatDateISO(endDate)} 23:59:59`;
    console.log(`[CrossChex] A recolher picagens de ${begin_time} a ${end_time}...`);

    let page = 1;
    let allRecords = [];
    let hasMore = true;

    while (hasMore) {
        const recRes = await fetch(CROSSCHEX_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                header: {
                    nameSpace: 'attendance.record',
                    nameAction: 'getrecord',
                    version: '1.0',
                    requestId: `${Date.now()}`,
                    timestamp: new Date().toISOString()
                },
                authorize: { type: 'token', token },
                payload: {
                    begin_time,
                    end_time,
                    order: 'asc',
                    page,
                    per_page: 500
                }
            })
        });

        const recData = await recRes.json();
        const list = recData.payload?.list || [];
        allRecords.push(...list);

        const total = recData.payload?.total || 0;
        if (allRecords.length >= total || list.length === 0 || page >= 10) {
            hasMore = false;
        } else {
            page++;
        }
    }

    console.log(`[CrossChex] Total de picagens brutas recolhidas: ${allRecords.length}`);
    return allRecords;
}

// --- PROCESSAMENTO DE ASSIDUIDADE ---
function processRecords(rawList, startDate, endDate) {
    const employeeMap = new Map();
    const periodDays = getDaysArray(startDate, endDate);

    for (const item of rawList) {
        const emp = item.employee;
        if (!emp || !emp.workno) continue;

        const workno = String(emp.workno).replace(/^0+/, '') || String(emp.workno);
        if (RULES.skipIds.includes(workno)) continue;

        let fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || `Colaborador ${workno}`;
        fullName = fullName.replace(/Fl[^\s]+vio/gi, 'Flávio').replace(/Ana[^\s]+s/gi, 'Anaís');

        if (!employeeMap.has(workno)) {
            employeeMap.set(workno, {
                id: workno,
                name: fullName,
                records: []
            });
        }

        const checktime = item.checktime ? String(item.checktime).replace('+00:00', 'Z') : '';
        if (checktime) {
            employeeMap.get(workno).records.push({
                checktime,
                checktype: item.checktype || 0
            });
        }
    }

    const processedEmployees = [];
    const sortedEmployees = Array.from(employeeMap.values()).sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    for (const emp of sortedEmployees) {
        const isExempt = RULES.exemptIds.includes(emp.id);

        const dayPunchesMap = new Map();
        for (const r of emp.records) {
            const dt = new Date(r.checktime);
            const dateKey = formatDateISO(dt);
            const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

            if (!dayPunchesMap.has(dateKey)) {
                dayPunchesMap.set(dateKey, []);
            }
            const pList = dayPunchesMap.get(dateKey);
            if (!pList.includes(timeStr)) {
                pList.push(timeStr);
            }
        }

        let totalWorkMinutes = 0;
        let totalOtMinutes = 0;
        const processedDays = [];

        for (const day of periodDays) {
            const rawPunches = (dayPunchesMap.get(day.dateKey) || []).sort((a, b) =>
                timeStringToMinutes(a) - timeStringToMinutes(b)
            );

            let entrada = '-';
            let s1 = '-';
            let e2 = '-';
            let saida = '-';
            let durationMinutes = 0;
            let extraMinutes = 0;
            let obsParts = [];

            const validPunches = [];
            for (const p of rawPunches) {
                if (validPunches.length === 0) {
                    validPunches.push(p);
                } else {
                    const prevMin = timeStringToMinutes(validPunches[validPunches.length - 1]);
                    const currMin = timeStringToMinutes(p);
                    if (currMin - prevMin >= 15) {
                        validPunches.push(p);
                    } else {
                        if (!obsParts.includes('Dupla Picagem')) {
                            obsParts.push('Dupla Picagem');
                        }
                    }
                }
            }

            const pc = validPunches.length;
            if (pc >= 4) {
                entrada = validPunches[0];
                s1 = validPunches[1];
                e2 = validPunches[2];
                saida = validPunches[validPunches.length - 1];
                durationMinutes = (timeStringToMinutes(s1) - timeStringToMinutes(entrada)) +
                                  (timeStringToMinutes(saida) - timeStringToMinutes(e2));
            } else if (pc === 3) {
                entrada = validPunches[0];
                s1 = validPunches[1];
                e2 = validPunches[2];
                durationMinutes = timeStringToMinutes(s1) - timeStringToMinutes(entrada);
                obsParts.push('Falta picagem (Almoço)');
            } else if (pc === 2) {
                entrada = validPunches[0];
                saida = validPunches[1];
                durationMinutes = timeStringToMinutes(saida) - timeStringToMinutes(entrada);
                if (durationMinutes > RULES.lunchThresholdMinutes) {
                    durationMinutes -= RULES.lunchAutoDeductMinutes;
                    obsParts.push('Falta break de almoço / Dedução 1h');
                }
            } else if (pc === 1) {
                const pMin = timeStringToMinutes(validPunches[0]);
                if (pMin < 780) { // Antes das 13:00
                    entrada = validPunches[0];
                    obsParts.push('Falta saída');
                } else {
                    saida = validPunches[0];
                    obsParts.push('Falta entrada');
                }
            }

            if (durationMinutes > 0) {
                totalWorkMinutes += durationMinutes;
                if (durationMinutes >= RULES.normalDayMinutes + RULES.overtimeToleranceMinutes + 1) {
                    extraMinutes = durationMinutes - (RULES.normalDayMinutes + RULES.overtimeToleranceMinutes);
                    totalOtMinutes += extraMinutes;
                }
            }

            const almoco = (s1 !== '-' || e2 !== '-') ? `${s1} - ${e2}` : '-';

            processedDays.push({
                dateKey: day.dateKey,
                dateStr: day.dateStr,
                isWeekend: day.isWeekend,
                entrada,
                almoco,
                saida,
                durationMinutes,
                durationStr: formatMinutesToHms(durationMinutes),
                extraMinutes,
                extraStr: extraMinutes > 0 ? `+${formatMinutesToHms(extraMinutes)}` : '-',
                obs: obsParts.join(' / ')
            });
        }

        const exemptionMinutes = 20 * 60; // 20 horas
        const payableOtMinutes = isExempt ? Math.max(0, totalOtMinutes - exemptionMinutes) : totalOtMinutes;

        processedEmployees.push({
            id: emp.id,
            name: emp.name,
            days: processedDays,
            totalWorkMinutes,
            totalWorkStr: formatMinutesToHms(totalWorkMinutes),
            totalOtMinutes,
            totalOtStr: formatMinutesToHms(totalOtMinutes),
            isExempt,
            exemptionMinutes,
            payableOtMinutes,
            payableOtStr: formatMinutesToHms(payableOtMinutes)
        });
    }

    return processedEmployees;
}

// --- GERADORES DE FICHEIROS ---
async function generateOutputs(processed, startDate, endDate, outputDir) {
    const startStr = formatDatePT(startDate);
    const endStr = formatDatePT(endDate);
    const fileSlug = `${formatDateISO(startDate).replace(/-/g, '')}_a_${formatDateISO(endDate).replace(/-/g, '')}`;

    // 1. CSV UTF-16 LE com BOM
    console.log('[Gerador] A criar CSV UTF-16 LE...');
    let csv = 'sep=;\r\n';
    csv += `Relatório de Assiduidade - Gengibre\r\n`;
    csv += `Período: ${startStr} a ${endStr}\r\n\r\n`;

    for (const emp of processed) {
        csv += `Colaborador: ${emp.name} (${emp.id})\r\n`;
        csv += 'Data;Entrada;Almoço;Saída;Total;Extra;Obs\r\n';
        for (const d of emp.days) {
            csv += `${d.dateStr};${d.entrada};${d.almoco};${d.saida};${d.durationStr};${d.extraStr};${d.obs}\r\n`;
        }
        csv += `TOTAL DO PERÍODO;;;;${emp.totalWorkStr};${emp.totalOtStr};\r\n`;
        if (emp.isExempt) {
            csv += 'Isenção de Horário: as primeiras 20h de trabalho extra estão incluídas no vencimento base.\r\n';
            if (emp.totalOtMinutes <= emp.exemptionMinutes) {
                csv += 'Dentro da isenção. Horas extra a pagar: 0h00m.\r\n';
            } else {
                csv += `Excedeu a isenção. Horas extra a pagar: ${emp.payableOtStr}\r\n`;
            }
        }
        csv += '\r\n';
    }

    const csvPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.csv`);
    const bom = Buffer.from([0xFF, 0xFE]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csv, 'utf16le')]);
    fs.writeFileSync(csvPath, csvBuffer);

    // 2. Excel (.xlsx)
    console.log('[Gerador] A criar Excel (.xlsx)...');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pontual';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Assiduidade Gengibre', {
        views: [{ showGridLines: true }]
    });

    sheet.columns = [
        { key: 'col1', width: 14 },
        { key: 'col2', width: 12 },
        { key: 'col3', width: 16 },
        { key: 'col4', width: 12 },
        { key: 'col5', width: 14 },
        { key: 'col6', width: 14 },
        { key: 'col7', width: 34 }
    ];

    for (const emp of processed) {
        const rHeader = sheet.addRow([`Colaborador: ${emp.name} (ID: ${emp.id})`]);
        rHeader.font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
        sheet.mergeCells(rHeader.number, 1, rHeader.number, 7);

        const rPeriod = sheet.addRow([`Período: ${startStr} a ${endStr}`]);
        rPeriod.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
        sheet.mergeCells(rPeriod.number, 1, rPeriod.number, 7);

        const rTableHead = sheet.addRow(['Data', 'Entrada', 'Almoço', 'Saída', 'Total', 'Extra', 'Obs']);
        rTableHead.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        for (const d of emp.days) {
            const row = sheet.addRow([
                d.dateStr,
                d.entrada,
                d.almoco,
                d.saida,
                d.durationStr,
                d.extraStr,
                d.obs
            ]);
            row.eachCell((cell, colNum) => {
                cell.alignment = { horizontal: colNum === 7 ? 'left' : 'center', vertical: 'middle' };
                if (d.isWeekend && d.entrada === '-') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                    cell.font = { color: { argb: 'FF94A3B8' } };
                }
            });
        }

        const rTotal = sheet.addRow(['TOTAL DO PERÍODO', '', '', '', emp.totalWorkStr, emp.totalOtStr, '']);
        rTotal.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        if (emp.isExempt) {
            const rEx = sheet.addRow([
                `Isenção de Horário: as primeiras 20h de trabalho extra estão incluídas no vencimento base. Horas extra a pagar: ${emp.payableOtStr}`
            ]);
            rEx.font = { italic: true, size: 10, color: { argb: 'FF92400E' } };
            sheet.mergeCells(rEx.number, 1, rEx.number, 7);
        }

        sheet.addRow([]);
    }

    const xlsxPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.xlsx`);
    await workbook.xlsx.writeFile(xlsxPath);

    // 3. HTML & PDF
    console.log('[Gerador] A criar HTML e PDF oficial...');
    const css = `
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10.5px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; }
.page { background: #fff; width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto 25px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px; }
.header-info h1 { color: #1e3a8a; font-size: 20px; margin: 0 0 3px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
.header-info p { color: #64748b; margin: 0; font-size: 11px; font-weight: 600; }
.emp-box { background: #f1f5f9; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; display: flex; gap: 35px; border-left: 4px solid #1e3a8a; }
.emp-box strong { color: #1e3a8a; text-transform: uppercase; font-size: 9.5px; display: block; margin-bottom: 1px; }
.emp-box span { font-size: 13px; font-weight: 600; color: #0f172a; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
th { background: #1e3a8a !important; color: #ffffff !important; padding: 6px 6px; font-size: 8.5px; border: 1px solid #1e3a8a; font-weight: 700; text-transform: uppercase; }
td { padding: 4.8px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 9px; line-height: 1.1; }
.col-data { width: 13%; }
.col-ent { width: 10%; }
.col-alm { width: 16%; }
.col-sai { width: 10%; }
.col-tot { width: 11%; font-weight: 600; }
.col-ext { width: 11%; font-weight: 600; }
.col-obs { text-align: left; padding-left: 8px; font-size: 8.5px; font-weight: 600; color: #d97706; }
.total-row td { background: #eff6ff !important; font-weight: 700; color: #1e3a8a !important; font-size: 9.5px; padding: 7px 6px; border-top: 2px solid #1e3a8a; }
.weekend-row td { background: #f8fafc; color: #94a3b8; }
.exempt-box { margin-top: 10px; padding: 8px 12px; background: #fef3c7 !important; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 9.5px; color: #92400e; }
.exempt-box strong { font-size: 10px; }
.signatures { margin-top: 24px; display: flex; justify-content: space-between; padding: 0 35px; }
.sig-line { width: 180px; text-align: center; }
.sig-line hr { border: none; border-top: 1px solid #94a3b8; margin-bottom: 5px; }
.sig-line span { font-size: 9px; color: #64748b; }
@media print {
    .no-print { display: none !important; }
    body { background: none; padding: 0; margin: 0; }
    .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; height: 297mm; }
}
`;

    let html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Assiduidade - Gengibre (${startStr} a ${endStr})</title>
    <style>${css}</style>
</head>
<body>`;

    for (const emp of processed) {
        let rowsHtml = '';
        for (const d of emp.days) {
            const isWk = d.isWeekend && d.entrada === '-';
            const rowClass = isWk ? 'class="weekend-row"' : '';
            rowsHtml += `<tr ${rowClass}>
                <td class="col-data">${d.dateStr}</td>
                <td class="col-ent">${d.entrada}</td>
                <td class="col-alm">${d.almoco}</td>
                <td class="col-sai">${d.saida}</td>
                <td class="col-tot">${d.durationStr}</td>
                <td class="col-ext">${d.extraStr}</td>
                <td class="col-obs">${d.obs ? `<span>${d.obs}</span>` : ''}</td>
            </tr>`;
        }

        let exemptHtml = '';
        if (emp.isExempt) {
            const isOver = emp.totalOtMinutes > emp.exemptionMinutes;
            exemptHtml = `
            <div class="exempt-box">
                <strong>Isenção de Horário:</strong> as primeiras 20h de trabalho extra estão incluídas no vencimento base.<br/>
                ${isOver ? `Excedeu a isenção. <strong>Horas extra a pagar: ${emp.payableOtStr}</strong>` : 'Dentro da isenção. Horas extra a pagar: 0h00m.'}
            </div>`;
        }

        html += `
        <div class="page">
            <div class="header">
                <div class="header-info">
                    <h1>Pontual | Gengibre</h1>
                    <p>Relatório de Assiduidade</p>
                </div>
            </div>

            <div class="emp-box">
                <div><strong>Colaborador</strong><span>${emp.name}</span></div>
                <div><strong>ID</strong><span>${emp.id}</span></div>
                <div><strong>Período</strong><span>${startStr} a ${endStr}</span></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th class="col-data">Data</th>
                        <th class="col-ent">Entrada</th>
                        <th class="col-alm">Almoço</th>
                        <th class="col-sai">Saída</th>
                        <th class="col-tot">Total</th>
                        <th class="col-ext">Extra</th>
                        <th class="col-obs">Obs</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="4" style="text-align:right; padding-right:12px;">TOTAL DO PERÍODO:</td>
                        <td>${emp.totalWorkStr}</td>
                        <td>${emp.totalOtStr}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>

            ${exemptHtml}

            <div class="signatures">
                <div class="sig-line"><hr/><span>Assinatura do Colaborador</span></div>
                <div class="sig-line"><hr/><span>Assinatura da Direção / Gestor</span></div>
            </div>
        </div>`;
    }

    html += `</body></html>`;
    const htmlPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');

    // PDF via Stirling-PDF API
    const pdfPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.pdf`);
    try {
        const formData = new FormData();
        const htmlBlob = new Blob([html], { type: 'text/html' });
        formData.append('fileInput', htmlBlob, 'report.html');

        const pdfRes = await fetch(STIRLING_PDF_URL, {
            method: 'POST',
            body: formData
        });

        if (pdfRes.ok) {
            const buffer = Buffer.from(await pdfRes.arrayBuffer());
            fs.writeFileSync(pdfPath, buffer);
            console.log(`[Gerador] PDF criado com sucesso: ${pdfPath}`);
        } else {
            console.error(`[Gerador] Erro no Stirling PDF: ${pdfRes.status} ${await pdfRes.text()}`);
        }
    } catch (e) {
        console.error(`[Gerador] Falha ao gerar PDF:`, e.message);
    }

    return {
        csvPath,
        xlsxPath,
        pdfPath,
        periodStr: `${startStr} a ${endStr}`,
        fileSlug
    };
}

// --- ENVIO DE EMAIL ---
async function sendReportEmail(files, isMonthlyClose = false) {
    console.log(`[Email] A configurar envio para ${EMAIL_RECIPIENTS.to} (CC: ${EMAIL_RECIPIENTS.cc})...`);
    
    const transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
    });

    const tipoRelatorio = isMonthlyClose ? 'Mensal (Fecho de Período)' : 'Acumulado Semanal';
    const subject = `Relatório de Assiduidade ${tipoRelatorio} - Gengibre (${files.periodStr})`;

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6; max-width: 600px;">
        <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0;">Pontualidade | Gestão de Assiduidade</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 12px;">Relatório Automático de Assiduidade</p>
        </div>
        
        <p>Olá Vasco,</p>
        
        <p>Encontra em anexo o <strong>Relatório de Assiduidade ${tipoRelatorio}</strong> da equipa <strong>Gengibre</strong>, referente ao período de <strong>${files.periodStr}</strong>.</p>
        
        <div style="background: #f1f5f9; border-left: 4px solid #1e3a8a; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #1e3a8a;">Documentos Anexados:</p>
            <ul style="margin: 0; padding-left: 20px;">
                <li><strong>PDF Oficial:</strong> Formatação completa com folhas individuais e campo de assinaturas.</li>
                <li><strong>CSV / Excel:</strong> Ficheiro compatível para análise de dados e processamento salarial.</li>
            </ul>
        </div>
        
        <p>Qualquer dúvida ou ajuste nos registos, estamos inteiramente ao dispor.</p>
        
        <p style="margin-top: 30px; font-size: 12px; color: #94a3b8;">
            Este é um email automático enviado pela plataforma Pontualidade.<br/>
            © ${new Date().getFullYear()} Pontualidade. Todos os direitos reservados.
        </p>
    </div>
    `;

    const attachments = [];
    if (fs.existsSync(files.pdfPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.pdf`,
            path: files.pdfPath
        });
    }
    if (fs.existsSync(files.csvPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.csv`,
            path: files.csvPath
        });
    }
    if (fs.existsSync(files.xlsxPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.xlsx`,
            path: files.xlsxPath
        });
    }

    const mailOptions = {
        from: EMAIL_RECIPIENTS.from,
        to: EMAIL_RECIPIENTS.to,
        cc: EMAIL_RECIPIENTS.cc,
        subject,
        html: emailHtml,
        attachments
    };

    const info = await transporter.sendMail(mailOptions);
    
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn('docker', ['exec', '-i', 'mailserver', 'sendmail', '-t']);
        proc.stdin.write(info.message);
        proc.stdin.end();

        let stderr = '';
        proc.stderr.on('data', data => { stderr += data.toString(); });
        proc.on('close', code => {
            if (code === 0) {
                console.log(`[Email] ✅ Email enviado com sucesso via mailserver!`);
                resolve({ success: true });
            } else {
                console.error(`[Email] ❌ Erro no sendmail:`, stderr);
                reject(new Error(stderr || `Sendmail exited with code ${code}`));
            }
        });
    });
}

// --- FUNÇÃO PRINCIPAL ---
async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const shouldSend = args.includes('--send');

    let customStart = null;
    let customEnd = null;

    const startIdx = args.indexOf('--start');
    if (startIdx !== -1 && args[startIdx + 1]) customStart = args[startIdx + 1];

    const endIdx = args.indexOf('--end');
    if (endIdx !== -1 && args[endIdx + 1]) customEnd = args[endIdx + 1];

    const { startDate, endDate, isMonthlyClose } = calculatePeriod(customStart, customEnd);
    console.log(`=== PONTUALIDADE - AUTOMAÇÃO GENGIBRE ===`);
    console.log(`Período: ${formatDatePT(startDate)} a ${formatDatePT(endDate)} (${isMonthlyClose ? 'Fecho Mensal' : 'Acumulado'})`);

    const outputDir = '/opt/pontual/gengibre-automation/reports';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Obter dados da Cloud
    const rawRecords = await fetchCrossChexRecords(startDate, endDate);

    // 2. Processar assiduidade e regras
    const processed = processRecords(rawRecords, startDate, endDate);
    console.log(`[Processador] ${processed.length} colaboradores processados.`);

    // 3. Gerar ficheiros
    const files = await generateOutputs(processed, startDate, endDate, outputDir);

    // 4. Enviar email se solicitado
    if (shouldSend && !isDryRun) {
        await sendReportEmail(files, isMonthlyClose);
    } else {
        console.log(`[Aviso] Modo teste/sem envio. Ficheiros guardados em: ${outputDir}`);
    }

    console.log(`=== PROCESSO CONCLUÍDO COM SUCESSO! ===`);
}

main().catch(err => {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
});
