import { prisma } from "../src/lib/db";
import { eachDayOfInterval, format, parseISO, isWeekend, subMonths, setDate as setDayOfMonth, startOfDay, endOfDay } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "../src/lib/api-server";
import { calculateSmartWorkHours } from "../src/lib/schedules";
import * as fs from 'fs';
import * as path from 'path';

// Output folder
const OUTPUT_DIR = path.join('C:', 'Users', 'JD', 'Documents', 'Pontual', 'Relatorios');

async function main() {
    console.log("=== Geração Local de Relatório Pontual ===\n");

    // Ensure output folder exists
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let users = await prisma.user.findMany({
        where: { apiKey: { not: null }, apiSecret: { not: null } }
    });

    // Filter to Gengibre/CC
    users = users.filter(u =>
        u.company?.toLowerCase().includes("cozinha criativa") ||
        u.username?.toLowerCase() === "gengibre" ||
        u.username?.toLowerCase() === "cc"
    );

    if (users.length === 0) {
        console.log("❌ Utilizador Gengibre/CC não encontrado na base de dados.");
        return;
    }

    const reportMonthStart = startOfDay(new Date(2026, 3, 25)); // 25 de Abril (Mês 3 em JS)
    const reportMonthEnd = endOfDay(new Date(2026, 4, 12));    // 12 de Maio (Mês 4 em JS)

    const beginTime = reportMonthStart.toISOString().replace('Z', '+00:00');
    const endTime = reportMonthEnd.toISOString().replace('Z', '+00:00');
    const periodLabel = `${format(reportMonthStart, 'dd-MM-yyyy')}_a_${format(reportMonthEnd, 'dd-MM-yyyy')}`;

    console.log(`Período: ${format(reportMonthStart, 'dd/MM/yyyy')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}\n`);

    for (const user of users) {
        console.log(`A processar: ${user.username} (${user.company})...`);
        try {
            const token = await getCrossChexToken(user.apiKey!, user.apiSecret!, user.apiUrl || undefined);

            const requestBody = {
                header: { nameSpace: "attendance.record", nameAction: "getrecord", version: "1.0", requestId: generateRequestId(), timestamp: generateTimestamp() },
                authorize: { type: "token", token },
                payload: { begin_time: beginTime, end_time: endTime, order: "asc", page: 1, per_page: 5000 }
            };

            const recordsResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
            });

            if (!recordsResponse.ok) throw new Error(`API error: ${recordsResponse.status}`);
            const recordsData = await recordsResponse.json();
            const rawRecords = recordsData.payload?.list || [];

            if (rawRecords.length === 0) { console.log("  ⚠️  Sem registos no período."); continue; }

            // Group by employee
            const employeesMap = new Map<string, { name: string; id: string; records: any[] }>();
            rawRecords.forEach((item: any) => {
                const id = item.employee.workno;
                if (!employeesMap.has(id)) {
                    employeesMap.set(id, { name: `${item.employee.first_name} ${item.employee.last_name}`.trim(), id, records: [] });
                }
                employeesMap.get(id)!.records.push(item);
            });

            const sortedEmployees = Array.from(employeesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

            const isGengibre = (user.company?.toLowerCase() || "").includes("cozinha criativa");
            const showOvertime = isGengibre;

            // === CSV GENERATION ===
            const csvLines: string[] = [];
            csvLines.push(`Relatório de Assiduidade - ${user.company}`);
            csvLines.push(`Período: ${format(reportMonthStart, 'dd/MM/yyyy')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}`);
            csvLines.push(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`);
            csvLines.push('');

            // === PDF GENERATION ===
            const doc = new jsPDF();

            let isFirstEmployee = true;
            for (const empData of sortedEmployees) {
                const empId = empData.id;
                const isExempt = isGengibre && (empId === "18" || empId === "11");
                let monthlyOvertimeMs = 0;

                // --- CSV per employee ---
                csvLines.push(`Colaborador: ${empData.name} (ID: ${empId})`);
                if (showOvertime) {
                    csvLines.push('Data;Entrada;Saída;Duração;H. Extra');
                } else {
                    csvLines.push('Data;Entrada;Saída;Duração');
                }

                // --- PDF header ---
                if (!isFirstEmployee) doc.addPage();
                isFirstEmployee = false;

                doc.setFontSize(18);
                doc.setTextColor(40);
                doc.text(user.reportHeader || `Pontual | ${user.company}`, 14, 22);
                doc.setFontSize(11);
                doc.setTextColor(100);
                doc.text(`Colaborador: ${empData.name} (${empId})`, 14, 32);
                doc.text(`Período: ${format(reportMonthStart, 'dd/MM/yyyy')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}`, 14, 38);
                doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 44);

                // --- Days data ---
                const daysData: string[][] = [];

                eachDayOfInterval({ start: reportMonthStart, end: reportMonthEnd }).forEach(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayItems = empData.records.filter((r: any) => r.checktime.startsWith(dateStr));

                    if (isWeekend(day) && dayItems.length === 0) return;

                    const sorted = dayItems.sort((a: any, b: any) => parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime());
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];

                    const calcChecks = sorted.map((r: any) => ({ time: r.checktime, type: r.checktype }));
                    const { totalWorkMs, overtimeHours } = calculateSmartWorkHours(calcChecks);

                    const durationH = Math.floor(totalWorkMs / 3600000);
                    const durationM = Math.floor((totalWorkMs % 3600000) / 60000);
                    const durationStr = totalWorkMs > 0 ? `${durationH}h ${durationM}m` : (dayItems.length > 0 ? "Em curso" : "-");

                    const dayOtMs = showOvertime ? overtimeHours * 3600000 : 0;
                    monthlyOvertimeMs += dayOtMs;
                    const otH = Math.floor(dayOtMs / 3600000);
                    const otM = Math.floor((dayOtMs % 3600000) / 60000);
                    const otStr = (showOvertime && dayOtMs > 0) ? `+${otH}h ${otM}m` : "-";

                    const entryStr = first ? format(parseISO(first.checktime), 'HH:mm') : '-';
                    const exitStr = (last && last !== first) ? format(parseISO(last.checktime), 'HH:mm') : '-';
                    const dateFormatted = format(day, 'dd/MM/yyyy');

                    // CSV row
                    if (showOvertime) {
                        csvLines.push(`${dateFormatted};${entryStr};${exitStr};${durationStr};${otStr}`);
                    } else {
                        csvLines.push(`${dateFormatted};${entryStr};${exitStr};${durationStr}`);
                    }

                    // PDF row
                    if (showOvertime) {
                        daysData.push([dateFormatted, entryStr, exitStr, durationStr, otStr]);
                    } else {
                        daysData.push([dateFormatted, entryStr, exitStr, durationStr]);
                    }
                });

                // --- Totals ---
                const totalWorkAllMs = daysData.reduce((acc, row) => {
                    const parts = row[3]?.match(/(\d+)h (\d+)m/);
                    if (parts) return acc + parseInt(parts[1]) * 3600000 + parseInt(parts[2]) * 60000;
                    return acc;
                }, 0);
                const tH = Math.floor(totalWorkAllMs / 3600000);
                const tM = Math.floor((totalWorkAllMs % 3600000) / 60000);
                const totalOtH = Math.floor(monthlyOvertimeMs / 3600000);
                const totalOtM = Math.floor((monthlyOvertimeMs % 3600000) / 60000);

                // CSV totals
                if (showOvertime) {
                    csvLines.push(`TOTAL;;;${tH}h ${tM}m;${totalOtH}h ${totalOtM}m`);
                } else {
                    csvLines.push(`TOTAL;;;${tH}h ${tM}m`);
                }

                // CSV exemption note
                if (isExempt) {
                    const EXEMPTION_MS = 20 * 3600000;
                    const withinExemption = monthlyOvertimeMs <= EXEMPTION_MS;
                    const payableOtMs = Math.max(0, monthlyOvertimeMs - EXEMPTION_MS);
                    const pOtH = Math.floor(payableOtMs / 3600000);
                    const pOtM = Math.floor((payableOtMs % 3600000) / 60000);
                    csvLines.push(`Isenção de Horário: primeiras 20h incluídas no vencimento`);
                    if (withinExemption) {
                        csvLines.push(`✓ Dentro da isenção — Horas Extra a Pagar: 0h 0m`);
                    } else {
                        csvLines.push(`! Excedeu a isenção — Horas Extra a Pagar: ${pOtH}h ${pOtM}m`);
                    }
                }
                csvLines.push(''); // blank line between employees

                // --- PDF table ---
                const totalsRow = showOvertime
                    ? ['TOTAL', '', '', `${tH}h ${tM}m`, `${totalOtH}h ${totalOtM}m`]
                    : ['TOTAL', '', '', `${tH}h ${tM}m`];

                autoTable(doc, {
                    head: [showOvertime ? ['Data', 'Entrada', 'Saída', 'Duração', 'H. Extra'] : ['Data', 'Entrada', 'Saída', 'Duração']],
                    body: [...daysData, totalsRow],
                    startY: 52,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 3 },
                    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
                    didParseCell: (data: any) => {
                        if (data.row.index === daysData.length) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = [240, 240, 240];
                        }
                    },
                    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 30 }, 4: { cellWidth: 30 } }
                });

                // PDF summary
                const tableEndY = (doc as any).lastAutoTable.finalY;
                let summaryY = tableEndY + 8;

                if (isExempt) {
                    const EXEMPTION_MS = 20 * 3600000;
                    const payableOtMs = Math.max(0, monthlyOvertimeMs - EXEMPTION_MS);
                    const pOtH = Math.floor(payableOtMs / 3600000);
                    const pOtM = Math.floor((payableOtMs % 3600000) / 60000);
                    const withinExemption = monthlyOvertimeMs <= EXEMPTION_MS;

                    doc.setFontSize(9);
                    doc.setTextColor(60);
                    doc.text(`Total Horas Extra no mês: ${totalOtH}h ${totalOtM}m`, 14, summaryY);
                    summaryY += 5;
                    doc.text(`Isenção de Horário: primeiras 20h incluídas no vencimento`, 14, summaryY);
                    summaryY += 5;
                    if (withinExemption) {
                        doc.setTextColor(34, 139, 34);
                        doc.text(`✓ Dentro da isenção — Horas Extra a Pagar: 0h 0m`, 14, summaryY);
                    } else {
                        doc.setTextColor(200, 0, 0);
                        doc.text(`! Excedeu a isenção — Horas Extra a Pagar: ${pOtH}h ${pOtM}m`, 14, summaryY);
                    }
                    doc.setTextColor(40);
                    summaryY += 8;
                }

                // PDF signatures
                const sigY = Math.max(summaryY + 20, 255);
                if (sigY > 275) doc.addPage();
                const lineY = sigY > 275 ? 40 : sigY;
                doc.setFontSize(9);
                doc.setTextColor(40);
                doc.text("__________________________", 30, lineY);
                doc.text("Assinatura Colaborador", 38, lineY + 5);
                doc.text("__________________________", 120, lineY);
                doc.text("Assinatura Responsável", 128, lineY + 5);
            }

            // Save PDF
            const pdfPath = path.join(OUTPUT_DIR, `Relatorio_${user.username}_${periodLabel}.pdf`);
            fs.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));
            console.log(`  ✅ PDF guardado: ${pdfPath}`);

            // Save CSV
            const csvPath = path.join(OUTPUT_DIR, `Relatorio_${user.username}_${periodLabel}.csv`);
            fs.writeFileSync(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf8'); // BOM for Excel
            console.log(`  ✅ CSV guardado: ${csvPath}`);

        } catch (err: any) {
            console.error(`  ❌ Erro: ${err.message}`);
        }
    }

    console.log(`\nConcluído! Ficheiros em: ${OUTPUT_DIR}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
