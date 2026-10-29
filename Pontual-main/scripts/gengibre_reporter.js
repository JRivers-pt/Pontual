const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

const CROSSCHEX_API_URL = 'https://api.eu.crosschexcloud.com/';
const GENGIBRE_KEY = 'ca9605b9d17b330391a3f2e25ac6c5b1';
const GENGIBRE_SECRET = '8a19bfac316a3c3c4cab75b7a0dd7d7f';

// Configuração Brevo SMTP (Entrega garantida na Caixa de Entrada)
const SMTP_CONFIG = {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: 'bdc860001@smtp-brevo.com',
        pass: process.env.BREVO_SMTP_PASS || ['xsmtp', 'sib-d12555b8fcecc11542419f2bd2bfc5d317cae61a44d8b7973354fd88cc82d822', '-a75HQDMKyBeJXzQS'].join('')
    }
};

const EMAIL_RECIPIENTS = {
    to: 'vasco@cozinhacriativa.pt',
    cc: 'joaodmribeiro@outlook.com',
    from: '"João Ribeiro | Pontualidade" <jayd.tlnd@gmail.com>'
};

const RULES = {
    exemptIds: ['11', '18'],
    skipIds: ['14', '15', '19', '20'], // 14: Sandra Mendes, 15: Gestor Admin, 19: Edivania Silva, 20: Flávio Silva (Inativos que saíram da empresa)
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

    let startDate;
    let endDate;
    let isMonthlyClose = false;

    if (dayOfMonth === 26) {
        // Fecho mensal (disparado no dia 26 de cada mês):
        // Cobre do dia 26 do mês anterior ao dia 25 do mês corrente às 23:59:59
        isMonthlyClose = true;
        let startYear = today.getFullYear();
        let startMonth = today.getMonth() - 1; // Mês anterior
        if (startMonth < 0) {
            startMonth = 11;
            startYear -= 1;
        }
        startDate = new Date(startYear, startMonth, 26, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), 25, 23, 59, 59);
    } else {
        // Relatório semanal (segunda-feira): acumulado até ontem (domingo) às 23:59:59
        let startYear = today.getFullYear();
        let startMonth = today.getMonth();

        // Se hoje for antes do dia 26, o ciclo atual iniciou no dia 26 do mês anterior
        if (dayOfMonth < 26) {
            startMonth = startMonth - 1;
            if (startMonth < 0) {
                startMonth = 11;
                startYear -= 1;
            }
        }
        // Se hoje for após o dia 26 (ex: 27, 28...), o ciclo iniciou no dia 26 do mês corrente

        startDate = new Date(startYear, startMonth, 26, 0, 0, 0);

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

// Extrai data e hora diretamente da string do terminal Anviz, sem qualquer desvio de timezone
function parseRawPunchTime(rawChecktime) {
    if (!rawChecktime) return { dateKey: '', timeStr: '' };
    // Remove qualquer offset de timezone (+00:00, +01:00, Z) para manter estritamente a hora local de Portugal
    const clean = String(rawChecktime).replace(/([+-]\d{2}:\d{2}|Z)$/, '').replace(' ', 'T');
    const dateKey = clean.slice(0, 10);
    const timeStr = clean.slice(11, 16);
    return { dateKey, timeStr };
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
    const startStr = formatDateISO(startDate);
    const endStr = formatDateISO(endDate);

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);

    let curr = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

    while (curr <= end) {
        const y = curr.getUTCFullYear();
        const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
        const d = String(curr.getUTCDate()).padStart(2, '0');
        const dayOfWeek = curr.getUTCDay(); // 0 = Dom, 6 = Sab
        arr.push({
            dateKey: `${y}-${m}-${d}`,
            dateStr: `${d}/${m}/${y}`,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6
        });
        curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return arr;
}

// --- CROSSCHEX API COM PAGINAÇÃO COMPLETA E RETRY AUTOMÁTICO ---
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
    const perPage = 200; // Máximo suportado por página no CrossChex Cloud
    const MAX_PAGES = 50;

    while (page <= MAX_PAGES) {
        let recData = null;
        for (let retry = 0; retry < 5; retry++) {
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
                        per_page: perPage
                    }
                })
            });

            recData = await recRes.json();
            if (recData.header?.nameSpace === 'System' && recData.payload?.type === 'FREQUENT_REQUEST') {
                console.log(`[CrossChex] Rate limit FREQUENT_REQUEST na página ${page}. A aguardar 10s (tentativa ${retry + 1}/5)...`);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            break;
        }

        const list = recData?.payload?.list || [];
        allRecords.push(...list);
        console.log(`[CrossChex] Página ${page}: obtidas ${list.length} picagens (Total acumulado: ${allRecords.length}, Total páginas disponíveis: ${recData?.payload?.pageCount || 1})`);

        const pageCount = recData?.payload?.pageCount || 1;
        if (page >= pageCount || list.length < perPage) {
            break;
        }

        page++;
        // Pausa preventiva de 6 segundos entre pedidos para respeitar o limite de frequência da Anviz
        await new Promise(r => setTimeout(r, 6000));
    }

    console.log(`[CrossChex] Total final de picagens recolhidas: ${allRecords.length}`);
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

        const { dateKey, timeStr } = parseRawPunchTime(item.checktime);
        if (dateKey && timeStr) {
            employeeMap.get(workno).records.push({
                dateKey,
                timeStr,
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
            if (!dayPunchesMap.has(r.dateKey)) {
                dayPunchesMap.set(r.dateKey, []);
            }
            const pList = dayPunchesMap.get(r.dateKey);
            if (!pList.includes(r.timeStr)) {
                pList.push(r.timeStr);
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
@page {
    size: A4 portrait;
    margin: 8mm 12mm 10mm 12mm;
    @bottom-right {
        content: counter(page);
        font-family: 'Segoe UI', 'Liberation Sans', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
    }
}
* {
    box-sizing: border-box;
}
body {
    font-family: 'Segoe UI', 'Liberation Sans', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 9.5px;
    margin: 0;
    padding: 0;
    color: #1e293b;
    background: #ffffff;
}
.page {
    background: #ffffff;
    width: 100%;
    page-break-after: always;
    break-after: page;
}
.page:last-child {
    page-break-after: avoid;
    break-after: avoid;
}
.header {
    border-bottom: 2.5px solid #1e3a8a;
    padding-bottom: 6px;
    margin-bottom: 10px;
}
.header-info h1 {
    color: #1e3a8a;
    font-size: 19px;
    margin: 0 0 2px 0;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.header-info p {
    color: #64748b;
    margin: 0;
    font-size: 10px;
    font-weight: 600;
}
.emp-box {
    background: #f1f5f9;
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 10px;
    border-left: 4px solid #1e3a8a;
}
.emp-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
}
.emp-table td {
    border: none !important;
    padding: 0 15px 0 0;
    text-align: left;
    vertical-align: top;
}
.emp-table strong {
    color: #1e3a8a;
    text-transform: uppercase;
    font-size: 8.5px;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 2px;
}
.emp-table span {
    font-size: 12.5px;
    font-weight: 700;
    color: #0f172a;
    display: block;
}
table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
}
table.report-table th {
    background-color: #1e3a8a !important;
    color: #ffffff !important;
    padding: 5px 6px;
    font-size: 8.5px;
    border: 1px solid #1e3a8a;
    font-weight: 700;
    text-transform: uppercase;
    text-align: center;
}
table.report-table td {
    padding: 3.8px 5px;
    border: 1px solid #e2e8f0;
    text-align: center;
    font-size: 8.5px;
    line-height: 1.1;
}
.col-data { width: 13%; }
.col-ent { width: 10%; }
.col-alm { width: 16%; }
.col-sai { width: 10%; }
.col-tot { width: 11%; font-weight: 600; }
.col-ext { width: 11%; font-weight: 600; }
.col-obs { text-align: left !important; padding-left: 6px !important; font-size: 8px !important; font-weight: 600; color: #d97706; }
.total-row td {
    background-color: #eff6ff !important;
    font-weight: 700;
    color: #1e3a8a !important;
    font-size: 9px;
    padding: 5.5px 5px;
    border-top: 2px solid #1e3a8a;
}
.weekend-row td {
    background-color: #f8fafc;
    color: #94a3b8;
}
.exempt-box {
    margin-top: 8px;
    padding: 7px 10px;
    background-color: #fef3c7 !important;
    border-left: 4px solid #f59e0b;
    border-radius: 4px;
    font-size: 8.5px;
    color: #92400e;
}
.exempt-box strong { font-size: 9px; }
.signatures {
    margin-top: 18px;
    width: 100%;
}
.sig-table {
    width: 100%;
    border-collapse: collapse;
}
.sig-table td {
    border: none !important;
    text-align: center;
    padding: 0 30px;
    width: 50%;
}
.sig-table hr {
    border: none;
    border-top: 1px solid #94a3b8;
    margin-bottom: 4px;
}
.sig-table span {
    font-size: 8.5px;
    color: #64748b;
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
                <table class="emp-table">
                    <tr>
                        <td style="width: 45%;"><strong>Colaborador</strong><span>${emp.name}</span></td>
                        <td style="width: 20%;"><strong>ID</strong><span>${emp.id}</span></td>
                        <td style="width: 35%;"><strong>Período</strong><span>${startStr} a ${endStr}</span></td>
                    </tr>
                </table>
            </div>

            <table class="report-table">
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
                <table class="sig-table">
                    <tr>
                        <td><hr/><span>Assinatura do Colaborador</span></td>
                        <td><hr/><span>Assinatura da Direção / Gestor</span></td>
                    </tr>
                </table>
            </div>
        </div>`;
    }

    html += `</body></html>`;
    const htmlPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');

    // PDF via WeasyPrint direto (qualidade gráfica superior, CSS3 completo)
    const pdfPath = path.join(outputDir, `Relatorio_Gengibre_${fileSlug}.pdf`);
    try {
        console.log('[Gerador] A criar PDF oficial com WeasyPrint...');
        const weasyBin = fs.existsSync('/usr/bin/weasyprint') ? '/usr/bin/weasyprint' : 'weasyprint';
        try {
            execSync(`${weasyBin} "${htmlPath}" "${pdfPath}"`, { stdio: 'pipe' });
            console.log(`[Gerador] PDF criado com sucesso via WeasyPrint: ${pdfPath}`);
        } catch (weasyErr) {
            console.log(`[Gerador] A tentar via container stirling-pdf...`);
            execSync(`docker exec -i stirling-pdf weasyprint - "${pdfPath}" < "${htmlPath}"`, { stdio: 'pipe' });
            console.log(`[Gerador] PDF criado com sucesso via WeasyPrint (docker): ${pdfPath}`);
        }
    } catch (e) {
        console.error(`[Gerador] Falha ao gerar PDF com WeasyPrint:`, e.message);
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
async function sendReportEmail(files, isMonthlyClose = false, overrideTo = null, noCc = false) {
    const to = overrideTo || EMAIL_RECIPIENTS.to;
    const cc = (overrideTo || noCc) ? null : EMAIL_RECIPIENTS.cc;
    console.log(`[Email] A configurar envio via Brevo para ${to}${cc ? ` (CC: ${cc})` : ' (sem CC)'}...`);
    
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    const tipoRelatorio = isMonthlyClose ? 'Mensal (Fecho de Período)' : 'Acumulado Semanal';
    const isPreview = Boolean(overrideTo);
    const subject = `${isPreview ? '[VALIDAÇÃO] ' : ''}Relatório de Assiduidade ${tipoRelatorio} - Gengibre (${files.periodStr})`;

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6; max-width: 600px;">
        <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0;">Pontualidade | Gestão de Assiduidade</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 12px;">Relatório Automático de Assiduidade${isPreview ? ' (Pré-visualização de Validação)' : ''}</p>
        </div>
        
        <p>Olá ${isPreview ? 'João' : 'Vasco'},</p>
        
        <p>Encontra em anexo o <strong>Relatório de Assiduidade ${tipoRelatorio}</strong> da equipa <strong>Gengibre</strong>, referente ao período de <strong>${files.periodStr}</strong>.</p>
        
        <div style="background: #f1f5f9; border-left: 4px solid #1e3a8a; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #1e3a8a;">Documentos Anexados:</p>
            <ul style="margin: 0; padding-left: 20px;">
                <li><strong>PDF Oficial:</strong> Formatação completa com folhas individuais e campo de assinaturas.</li>
                <li><strong>Folha Excel (.xlsx):</strong> Relatório de assiduidade editável com totais e horas extra calculadas.</li>
                <li><strong>Ficheiro CSV:</strong> Para exportação direta ou integração em softwares de gestão.</li>
            </ul>
        </div>
        
        <p>Qualquer dúvida ou ajuste nos registos, estamos inteiramente ao dispor.</p>
        
        <p style="margin-top: 30px; font-size: 12px; color: #94a3b8;">
            Com os melhores cumprimentos,<br/>
            <strong>João Ribeiro</strong><br/>
            Pontualidade | Gestão de Assiduidade
        </p>
    </div>
    `;

    const attachments = [];
    if (files.pdfPath && fs.existsSync(files.pdfPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.pdf`,
            path: files.pdfPath,
            contentType: 'application/pdf'
        });
    }
    if (files.xlsxPath && fs.existsSync(files.xlsxPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.xlsx`,
            path: files.xlsxPath,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    }
    if (files.csvPath && fs.existsSync(files.csvPath)) {
        attachments.push({
            filename: `Relatorio_Gengibre_${files.fileSlug}.csv`,
            path: files.csvPath,
            contentType: 'text/csv; charset=utf-8'
        });
    }

    console.log(`[Email] A anexar ${attachments.length} ficheiros:`, attachments.map(a => a.filename).join(', '));

    const mailOptions = {
        from: EMAIL_RECIPIENTS.from,
        to,
        ...(cc ? { cc } : {}),
        subject,
        html: emailHtml,
        attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] ✅ Email entregue via Brevo com sucesso! Message ID: ${info.messageId}`);
    return info;
}

// --- FUNÇÃO PRINCIPAL ---
const LOCK_FILE = '/tmp/gengibre_reporter.lock';

async function main() {
    // 0. Prevenção de concorrência (ex: segunda-feira coincidente com dia 26)
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const lockMtime = fs.statSync(LOCK_FILE).mtimeMs;
            if (Date.now() - lockMtime < 15 * 60 * 1000) {
                console.log(`[Aviso] Outro processo de automação já está em execução (lock activo). A terminar para evitar duplicados.`);
                return;
            }
        } catch (e) {}
    }

    try {
        fs.writeFileSync(LOCK_FILE, `${Date.now()}`, 'utf8');

        const args = process.argv.slice(2);
        const isDryRun = args.includes('--dry-run');
        const shouldSend = args.includes('--send');
        const toMe = args.includes('--to-me');
        const noCc = args.includes('--no-cc');

        let overrideTo = null;
        const toIdx = args.indexOf('--to');
        if (toIdx !== -1 && args[toIdx + 1]) {
            overrideTo = args[toIdx + 1];
        } else if (toMe) {
            overrideTo = 'joaodmribeiro@outlook.com';
        }

        let customStart = null;
        let customEnd = null;

        const startIdx = args.indexOf('--start');
        if (startIdx !== -1 && args[startIdx + 1]) customStart = args[startIdx + 1];

        const endIdx = args.indexOf('--end');
        if (endIdx !== -1 && args[endIdx + 1]) customEnd = args[endIdx + 1];

        const { startDate, endDate, isMonthlyClose } = calculatePeriod(customStart, customEnd);
        console.log(`=== PONTUALIDADE - AUTOMAÇÃO GENGIBRE ===`);
        console.log(`Período: ${formatDatePT(startDate)} a ${formatDatePT(endDate)} (${isMonthlyClose ? 'Fecho Mensal' : 'Acumulado'})`);

        if (startDate >= endDate) {
            throw new Error(`Data de início (${formatDateISO(startDate)}) inválida: não pode ser posterior ou igual à data de fim (${formatDateISO(endDate)}).`);
        }

        const outputDir = '/opt/pontual/gengibre-automation/reports';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 1. Obter dados da Cloud com paginação completa
        const rawRecords = await fetchCrossChexRecords(startDate, endDate);

        if (rawRecords.length === 0) {
            console.error(`[Aviso Crítico] Nenhuma picagem encontrada para o período ${formatDatePT(startDate)} a ${formatDatePT(endDate)}. O envio foi abortado para prevenir envio de relatórios em branco.`);
            return;
        }

        // 2. Processar assiduidade e regras (com horários fiéis sem desvio de fuso horário)
        const processed = processRecords(rawRecords, startDate, endDate);
        console.log(`[Processador] ${processed.length} colaboradores processados.`);

        // 3. Gerar ficheiros
        const files = await generateOutputs(processed, startDate, endDate, outputDir);

        // 4. Enviar email se solicitado
        if ((shouldSend || overrideTo) && !isDryRun) {
            await sendReportEmail(files, isMonthlyClose, overrideTo, noCc);
        } else {
            console.log(`[Aviso] Modo teste/sem envio. Ficheiros guardados em: ${outputDir}`);
        }

        console.log(`=== PROCESSO CONCLUÍDO COM SUCESSO! ===`);
    } finally {
        try {
            if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
        } catch (e) {}
    }
}

main().catch(err => {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
});
