const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');

const inputFile = "C:\\Users\\JD\\Downloads\\Records_AllDepts_260826_to_260925_7502.xls";
const outputDir = "C:\\Users\\JD\\Documents\\Pontual\\Relatorios";

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log("-> A ler ficheiro:", inputFile);
if (!fs.existsSync(inputFile)) {
    console.error("Ficheiro nao encontrado:", inputFile);
    process.exit(1);
}

const content = fs.readFileSync(inputFile, "utf8");

const cellRegex = /<td[^>]*>(.*?)<\/td>/gi;
let match;
const employeeMap = new Map();
let currentEmp = null;
let currentDate = null;

while ((match = cellRegex.exec(content)) !== null) {
    let val = match[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
    if (!val) continue;

    const empM = val.match(/^(\d+)\s*-\s*(.*)$/);
    if (empM) {
        const id = empM[1].trim();
        let name = empM[2].trim().replace(/\s+/g, " ");

        name = name.replace(/Fl[^\s]+vio/gi, "Flávio")
                   .replace(/Ana[^\s]+s/gi, "Anaís");

        if (!employeeMap.has(id)) {
            employeeMap.set(id, { id, name, records: [] });
        }
        currentEmp = employeeMap.get(id);
        currentDate = null;
        continue;
    }

    // Gengibre 7502 format: MM/DD/YYYY
    const dateM = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateM && currentEmp) {
        const month = dateM[1].padStart(2, "0");
        const day = dateM[2].padStart(2, "0");
        const year = dateM[3];
        currentDate = `${year}-${month}-${day}`;
        continue;
    }

    const timeM = val.match(/^(\d{1,2}:\d{2})$/);
    if (timeM && currentEmp && currentDate) {
        const punch = timeM[1];
        currentEmp.records.push({
            checktime: `${currentDate}T${punch}:00`,
            checktype: "0"
        });
    }
}

console.log(`Encontrados ${employeeMap.size} colaboradores no ficheiro.`);

function timeStringToMinutes(timeStr) {
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return 0;
}

function formatMinutesToHms(minutes) {
    if (minutes <= 0) return "-";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m.toString().padStart(2, "0")}m`;
}

function getDaysArray(startStr, endStr) {
    const arr = [];
    let curr = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        const dayOfWeek = curr.getDay(); // 0 = Sun, 6 = Sat
        arr.push({
            dateKey: `${y}-${m}-${d}`,
            dateStr: `${d}/${m}/${y}`,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            dateObj: new Date(curr)
        });
        curr.setDate(curr.getDate() + 1);
    }
    return arr;
}

const startPeriodStr = "2026-08-26";
const endPeriodStr = "2026-09-25";
const periodDays = getDaysArray(startPeriodStr, endPeriodStr);

const rules = {
    exemptIds: ["11", "18"],
    skipIds: ["15"], // Excluir Gestor Admin
    overtimeToleranceMinutes: 5,
    normalDayMinutes: 480, // 8h
    lunchAutoDeductMinutes: 60,
    lunchThresholdMinutes: 360 // 6h
};

const employeesToProcess = Array.from(employeeMap.values())
    .filter(e => !rules.skipIds.includes(e.id))
    .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

console.log(`A processar ${employeesToProcess.length} colaboradores para o período de ${startPeriodStr} a ${endPeriodStr}...`);

function processEmployee(emp) {
    const isExempt = rules.exemptIds.includes(String(emp.id).trim());

    // Group punches by day
    const dayPunchesMap = new Map();
    for (const r of emp.records) {
        const dateKey = r.checktime.slice(0, 10);
        const timeStr = r.checktime.slice(11, 16);

        if (!dayPunchesMap.has(dateKey)) {
            dayPunchesMap.set(dateKey, []);
        }
        const list = dayPunchesMap.get(dateKey);
        if (!list.includes(timeStr)) {
            list.push(timeStr);
        }
    }

    let totalWorkMinutes = 0;
    let totalOtMinutes = 0;
    const processedDays = [];

    for (const day of periodDays) {
        const dateKey = day.dateKey;
        const rawPunches = (dayPunchesMap.get(dateKey) || []).sort((a, b) => 
            timeStringToMinutes(a) - timeStringToMinutes(b)
        );

        let entrada = "-";
        let s1 = "-";
        let e2 = "-";
        let saida = "-";
        let durationMinutes = 0;
        let extraMinutes = 0;
        let obsParts = [];

        // Double punch filter (< 15 mins)
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
                    if (!obsParts.includes("Dupla Picagem")) {
                        obsParts.push("Dupla Picagem");
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
            obsParts.push("Falta picagem (Almoço)");
        } else if (pc === 2) {
            entrada = validPunches[0];
            saida = validPunches[1];
            durationMinutes = timeStringToMinutes(saida) - timeStringToMinutes(entrada);
            if (durationMinutes > rules.lunchThresholdMinutes) {
                durationMinutes -= rules.lunchAutoDeductMinutes;
                obsParts.push("Falta break de almoço / Dedução 1h");
            }
        } else if (pc === 1) {
            const pMin = timeStringToMinutes(validPunches[0]);
            if (pMin < 780) { // before 13:00
                entrada = validPunches[0];
                obsParts.push("Falta saída");
            } else {
                saida = validPunches[0];
                obsParts.push("Falta entrada");
            }
        }

        if (durationMinutes > 0) {
            totalWorkMinutes += durationMinutes;
            if (durationMinutes >= rules.normalDayMinutes + rules.overtimeToleranceMinutes + 1) {
                extraMinutes = durationMinutes - (rules.normalDayMinutes + rules.overtimeToleranceMinutes);
                totalOtMinutes += extraMinutes;
            }
        }

        const almoco = (s1 !== "-" || e2 !== "-") ? `${s1} - ${e2}` : "-";

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
            extraStr: extraMinutes > 0 ? `+${formatMinutesToHms(extraMinutes)}` : "-",
            obs: obsParts.join(" / ")
        });
    }

    const exemptionMinutes = 20 * 60; // 20 hours = 1200 minutes
    const payableOtMinutes = isExempt ? Math.max(0, totalOtMinutes - exemptionMinutes) : totalOtMinutes;

    return {
        id: String(emp.id),
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
    };
}

const processed = employeesToProcess.map(emp => processEmployee(emp));

async function generateFiles() {
    // 1. GERAR EXCEL NATIVO (.xlsx)
    console.log("-> A gerar Excel nativo (.xlsx)...");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Pontual";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Assiduidade Gengibre", {
        views: [{ showGridLines: true }]
    });

    sheet.columns = [
        { key: "col1", width: 14 },
        { key: "col2", width: 12 },
        { key: "col3", width: 16 },
        { key: "col4", width: 12 },
        { key: "col5", width: 14 },
        { key: "col6", width: 14 },
        { key: "col7", width: 34 }
    ];

    for (const emp of processed) {
        // Employee header
        const rHeader = sheet.addRow([`Colaborador: ${emp.name} (ID: ${emp.id})`]);
        rHeader.font = { bold: true, size: 12, color: { argb: "FF1E3A8A" } };
        sheet.mergeCells(rHeader.number, 1, rHeader.number, 7);

        const rPeriod = sheet.addRow([`Período: 26/08/2026 a 25/09/2026`]);
        rPeriod.font = { italic: true, size: 10, color: { argb: "FF64748B" } };
        sheet.mergeCells(rPeriod.number, 1, rPeriod.number, 7);

        // Table Header
        const rTableHead = sheet.addRow(["Data", "Entrada", "Almoço", "Saída", "Total", "Extra", "Obs"]);
        rTableHead.eachCell(cell => {
            cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E3A8A" }
            };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        // Days
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
                cell.alignment = {
                    horizontal: colNum === 7 ? "left" : "center",
                    vertical: "middle"
                };
                if (d.isWeekend && d.entrada === "-") {
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFF8FAFC" }
                    };
                    cell.font = { color: { argb: "FF94A3B8" } };
                }
            });
        }

        // Total row
        const rTotal = sheet.addRow([
            "TOTAL DO PERÍODO",
            "",
            "",
            "",
            emp.totalWorkStr,
            emp.totalOtStr,
            ""
        ]);
        rTotal.eachCell(cell => {
            cell.font = { bold: true, color: { argb: "FF1E3A8A" }, size: 10 };
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE0E7FF" }
            };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        if (emp.isExempt) {
            const rEx = sheet.addRow([
                `Isenção de Horário: as primeiras 20h de trabalho extra estão incluídas no vencimento base. Horas extra a pagar: ${emp.payableOtStr}`
            ]);
            rEx.font = { italic: true, size: 10, color: { argb: "FF92400E" } };
            sheet.mergeCells(rEx.number, 1, rEx.number, 7);
        }

        sheet.addRow([]); // Blank spacing row
    }

    const xlsxPath = path.join(outputDir, "Relatorio_Gengibre_26_Agosto_a_25_Setembro.xlsx");
    await workbook.xlsx.writeFile(xlsxPath);
    console.log("   [OK] Excel criado:", xlsxPath);

    // 2. GERAR CSV FORMATADO UTF-16 LE COM BOM (sep=;)
    console.log("-> A gerar CSV compativel (UTF-16 LE com sep=;)...");
    let csv = "sep=;\r\n";
    csv += "Relatório de Assiduidade - Gengibre\r\n";
    csv += "Período: 26/08/2026 a 25/09/2026\r\n\r\n";

    for (const emp of processed) {
        csv += `Colaborador: ${emp.name} (${emp.id})\r\n`;
        csv += "Data;Entrada;Almoço;Saída;Total;Extra;Obs\r\n";
        for (const d of emp.days) {
            csv += `${d.dateStr};${d.entrada};${d.almoco};${d.saida};${d.durationStr};${d.extraStr};${d.obs}\r\n`;
        }
        csv += `TOTAL DO PERÍODO;;;;${emp.totalWorkStr};${emp.totalOtStr};\r\n`;
        if (emp.isExempt) {
            csv += "Isenção de Horário: as primeiras 20h de trabalho extra estão incluídas no vencimento base.\r\n";
            if (emp.totalOtMinutes <= emp.exemptionMinutes) {
                csv += "Dentro da isenção. Horas extra a pagar: 0h00m.\r\n";
            } else {
                csv += `Excedeu a isenção. Horas extra a pagar: ${emp.payableOtStr}\r\n`;
            }
        }
        csv += "\r\n";
    }
    const csvPath = path.join(outputDir, "Relatorio_Gengibre_26_Agosto_a_25_Setembro.csv");
    const bom = Buffer.from([0xFF, 0xFE]);
    const csvBuffer = Buffer.concat([bom, Buffer.from(csv, "utf16le")]);
    fs.writeFileSync(csvPath, csvBuffer);
    console.log("   [OK] CSV criado:", csvPath);

    // 3. GERAR HTML COM DESIGN OFICIAL PONTUAL
    console.log("-> A gerar HTML...");
    const css = `
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10.5px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
    <title>Relatório Mensal de Assiduidade - Gengibre (26/08 a 25/09/2026)</title>
    <style>${css}</style>
</head>
<body>
<div class="no-print" style="text-align:center; padding: 15px; background: #e2e8f0; margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #1e3a8a; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 700; cursor: pointer;">
        Gerar PDF / Imprimir
    </button>
</div>
`;

    for (const emp of processed) {
        let rowsHtml = "";
        for (const d of emp.days) {
            const isWk = d.isWeekend && d.entrada === "-";
            const rowClass = isWk ? 'class="weekend-row"' : "";
            rowsHtml += `<tr ${rowClass}>
                <td class="col-data">${d.dateStr}</td>
                <td class="col-ent">${d.entrada}</td>
                <td class="col-alm">${d.almoco}</td>
                <td class="col-sai">${d.saida}</td>
                <td class="col-tot">${d.durationStr}</td>
                <td class="col-ext">${d.extraStr}</td>
                <td class="col-obs">${d.obs ? `<span>${d.obs}</span>` : ""}</td>
            </tr>`;
        }

        let exemptHtml = "";
        if (emp.isExempt) {
            const isOver = emp.totalOtMinutes > emp.exemptionMinutes;
            exemptHtml = `
            <div class="exempt-box">
                <strong>Isenção de Horário:</strong> as primeiras 20h de trabalho extra estão incluídas no vencimento base.<br/>
                ${isOver ? `Excedeu a isenção. <strong>Horas extra a pagar: ${emp.payableOtStr}</strong>` : "Dentro da isenção. Horas extra a pagar: 0h00m."}
            </div>`;
        }

        html += `
        <div class="page">
            <div class="header">
                <div class="header-info">
                    <h1>Pontual | Gengibre</h1>
                    <p>Relatório de Assiduidade Mensal</p>
                </div>
            </div>

            <div class="emp-box">
                <div>
                    <strong>Colaborador</strong>
                    <span>${emp.name}</span>
                </div>
                <div>
                    <strong>ID</strong>
                    <span>${emp.id}</span>
                </div>
                <div>
                    <strong>Período</strong>
                    <span>26/08/2026 a 25/09/2026</span>
                </div>
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
                <tbody>
                    ${rowsHtml}
                </tbody>
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
                <div class="sig-line">
                    <hr/>
                    <span>Assinatura do Colaborador</span>
                </div>
                <div class="sig-line">
                    <hr/>
                    <span>Assinatura da Direção / Gestor</span>
                </div>
            </div>
        </div>`;
    }

    html += `</body></html>`;
    const htmlPath = path.join(outputDir, "Relatorio_Gengibre_26_Agosto_a_25_Setembro.html");
    fs.writeFileSync(htmlPath, html, "utf8");
    console.log("   [OK] HTML criado:", htmlPath);

    // 4. GERAR PDF VIA EDGE HEADLESS
    console.log("-> A gerar PDF via Microsoft Edge Headless...");
    const pdfPath = path.join(outputDir, "Relatorio_Gengibre_26_Agosto_a_25_Setembro.pdf");
    const edgeExe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

    if (fs.existsSync(edgeExe)) {
        try {
            const cmd = `"${edgeExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file:///${htmlPath.replace(/\\/g, "/")}"`;
            execSync(cmd, { stdio: "ignore" });
            console.log("   [OK] PDF gerado via Edge:", pdfPath);
        } catch (e) {
            console.error("Erro ao gerar PDF:", e);
        }
    }

    console.log("\n=== RELATÓRIO MENSAL GENGIBRE (26/08 A 25/09) GERADO COM SUCESSO! ===");
}

generateFiles().catch(console.error);
