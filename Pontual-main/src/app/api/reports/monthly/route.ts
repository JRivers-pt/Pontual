import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { eachDayOfInterval, format, parseISO, isWeekend, subMonths, addMonths, setDate as setDayOfMonth, startOfDay, endOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "@/lib/api-server";
import { calculateSmartWorkHours } from "@/lib/schedules";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const forceRun = searchParams.get("force") === "true";
    const authHeader = request.headers.get("authorization");
    
    // Basic security check for cron (if not forced via query param)
    if (!forceRun && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch users with automated reports enabled
        let users = await prisma.user.findMany({
            where: { 
                autoEmailReports: true,
                vpEmail: { not: null },
                apiKey: { not: null },
                apiSecret: { not: null }
            }
        });

        // Fallback: ensure Gengibre always gets reports even if DB wasn't updated via script
        const gengibreInList = users.some(u => u.company?.toLowerCase().includes("cozinha criativa") || u.username?.toLowerCase() === "gengibre");
        if (!gengibreInList) {
            const gengibreUser = await prisma.user.findFirst({
                where: { 
                    OR: [
                        { company: { contains: "Cozinha Criativa" } },
                        { username: "Gengibre" }
                    ],
                    apiKey: { not: null },
                    apiSecret: { not: null }
                }
            });
            if (gengibreUser) {
                // Use hardcoded email if not set in DB
                (gengibreUser as any).vpEmail = gengibreUser.vpEmail || "gengibre@cozinhacriativa.pt";
                users.push(gengibreUser);
            }
        }

        if (users.length === 0) {
            return Response.json({ message: "No users configured for automated reports" });
        }

        const results = [];
        const now = new Date();
        
        // Define period: 26th of last/current month to 25th of current/next month depending on today's date
        let reportMonthStart: Date;
        let reportMonthEnd: Date;
        if (now.getDate() >= 26) {
            reportMonthStart = startOfDay(setDayOfMonth(now, 26));
            reportMonthEnd = endOfDay(setDayOfMonth(addMonths(now, 1), 25));
        } else {
            reportMonthStart = startOfDay(setDayOfMonth(subMonths(now, 1), 26));
            reportMonthEnd = endOfDay(setDayOfMonth(now, 25));
        }
        
        const beginTime = reportMonthStart.toISOString().replace('Z', '+00:00');
        const endTime = reportMonthEnd.toISOString().replace('Z', '+00:00');

        for (const user of users) {
            try {
                const reportEmail = user.vpEmail!;
                const token = await getCrossChexToken(user.apiKey!, user.apiSecret!, user.apiUrl || undefined);

                const requestBody = {
                    header: {
                        nameSpace: "attendance.record",
                        nameAction: "getrecord",
                        version: "1.0",
                        requestId: generateRequestId(),
                        timestamp: generateTimestamp()
                    },
                    authorize: {
                        type: "token",
                        token: token
                    },
                    payload: {
                        begin_time: beginTime,
                        end_time: endTime,
                        order: "asc",
                        page: 1,
                        per_page: 5000
                    }
                };

                const recordsResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!recordsResponse.ok) throw new Error(`Cloud API error: ${recordsResponse.status}`);

                const recordsData = await recordsResponse.json();
                const rawRecords = recordsData.payload?.list || [];

                if (rawRecords.length === 0) {
                    results.push({ user: user.username, status: "No records found" });
                    continue;
                }

                const employeesMap = new Map();
                rawRecords.forEach((item: any) => {
                    const id = item.employee.workno;
                    if (!employeesMap.has(id)) {
                        employeesMap.set(id, { 
                            name: `${item.employee.first_name} ${item.employee.last_name}`.trim(), 
                            id: id,
                            records: [] 
                        });
                    }
                    employeesMap.get(id).records.push(item);
                });

                const doc = new jsPDF();
                const sortedEmployees = Array.from(employeesMap.values()).sort((a: any, b: any) => 
                    a.name.localeCompare(b.name)
                );

                let isFirstEmployee = true;
                for (const empData of sortedEmployees) {
                    const empId = empData.id;
                    if (!isFirstEmployee) doc.addPage();
                    isFirstEmployee = false;

                    // Client specific logic
                    const company = user.company || "";
                    const { getClientRules } = require("@/lib/schedules");
                    const rules = getClientRules(company);

                    const isVP = company.toLowerCase().includes("vila peixoto") || company.toLowerCase().includes("vp");
                    const isGengibre = company.toLowerCase().includes("gengibre") || company.toLowerCase().includes("cozinha criativa");

                    // Skip Julio (ID 8) for VP
                    if (isVP && String(empId) === '8') continue;

                    // Hide OT column for VP as per previous requests, but keep calculation for others
                    const showOvertime = !isVP;
                    const isExempt = rules.exemptIds.includes(String(empId));
                    let monthlyOvertimeMs = 0;

                    // Header Color (Dark Blue)
                    const PRIMARY_COLOR = [30, 58, 138]; // #1e3a8a

                    doc.setFontSize(20);
                    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
                    doc.text(user.reportHeader || `Pontual | ${user.company || 'Relatório'}`, 14, 22);

                    doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
                    doc.setLineWidth(0.5);
                    doc.line(14, 25, 196, 25);

                    doc.setFontSize(10);
                    doc.setTextColor(80);
                    doc.text(`Colaborador: ${empData.name} (${empId})`, 14, 33);
                    doc.text(`Período: ${format(reportMonthStart, 'dd/MM/yyyy')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}`, 14, 38);
                    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 43);

                    const daysData = eachDayOfInterval({ start: reportMonthStart, end: reportMonthEnd }).map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayItems = empData.records.filter((r: any) => r.checktime.startsWith(dateStr));

                        if (isWeekend(day) && dayItems.length === 0) return null;

                        const sorted = dayItems.sort((a: any, b: any) => parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime());
                        const first = sorted[0];
                        const last = sorted[sorted.length - 1];
                        
                        const calcChecks = sorted.map((r: any) => ({ time: r.checktime, type: r.checktype }));
                        const { totalWorkMs, overtimeHours } = calculateSmartWorkHours(calcChecks, company);
                        
                        const durationH = Math.floor(totalWorkMs / 3600000);
                        const durationM = Math.floor((totalWorkMs % 3600000) / 60000);
                        const durationStr = totalWorkMs > 0 ? `${durationH}h ${durationM}m` : (dayItems.length > 0 ? "Em curso" : "-");

                        const dayOtMs = overtimeHours * 3600000;
                        monthlyOvertimeMs += dayOtMs;
                        
                        const otH = Math.floor(dayOtMs / 3600000);
                        const otM = Math.floor((dayOtMs % 3600000) / 60000);
                        const otStr = dayOtMs > 0 ? `+${otH}h ${otM}m` : "-";

                        const row = [
                            format(day, 'dd/MM/yyyy'),
                            first ? format(parseISO(first.checktime), 'HH:mm') : '-',
                            (last && last !== first) ? format(parseISO(last.checktime), 'HH:mm') : '-',
                            durationStr
                        ];
                        if (showOvertime) row.push(otStr);
                        return row;
                    }).filter(Boolean);

                    // Totals calculation
                    const totalWorkAllMs = daysData.reduce((acc: number, row: any) => {
                        if (!row) return acc;
                        const parts = row[3]?.match(/(\d+)h (\d+)m/);
                        if (parts) return acc + parseInt(parts[1]) * 3600000 + parseInt(parts[2]) * 60000;
                        return acc;
                    }, 0);
                    const tH = Math.floor(totalWorkAllMs / 3600000);
                    const tM = Math.floor((totalWorkAllMs % 3600000) / 60000);
                    const totalOtH = Math.floor(monthlyOvertimeMs / 3600000);
                    const totalOtM = Math.floor((monthlyOvertimeMs % 3600000) / 60000);

                    const totalsRow = ['TOTAL', '', '', `${tH}h ${tM}m`];
                    if (showOvertime) totalsRow.push(`${totalOtH}h ${totalOtM}m`);

                    autoTable(doc, {
                        head: [showOvertime ? ['Data', 'Entrada', 'Saída', 'Duração', 'H. Extra'] : ['Data', 'Entrada', 'Saída', 'Duração']],
                        body: [
                            ...(daysData as any[][]),
                            totalsRow
                        ],
                        startY: 50,
                        theme: 'grid',
                        styles: { fontSize: 8, cellPadding: 2.5 },
                        headStyles: { fillColor: PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
                        alternateRowStyles: { fillColor: [248, 250, 252] },
                        didParseCell: (data: any) => {
                            if (data.row.index === (daysData as any[][]).length) {
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fillColor = [224, 242, 254]; // Light blue
                            }
                        }
                    });

                    const tableEndY = (doc as any).lastAutoTable.finalY;
                    let summaryY = tableEndY + 10;

                    // Summary Box for Overtime/Exemptions
                    if (showOvertime) {
                        doc.setFillColor(248, 250, 252);
                        doc.setDrawColor(203, 213, 225);
                        doc.roundedRect(14, summaryY, 182, isExempt ? 25 : 15, 2, 2, 'FD');
                        
                        doc.setFontSize(9);
                        doc.setTextColor(40);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`Resumo Mensal`, 18, summaryY + 6);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`Total Horas Extra: ${totalOtH}h ${totalOtM}m`, 18, summaryY + 12);
                        
                        if (isExempt) {
                            const EXEMPTION_MS = 20 * 3600000;
                            const payableOtMs = Math.max(0, monthlyOvertimeMs - EXEMPTION_MS);
                            const pOtH = Math.floor(payableOtMs / 3600000);
                            const pOtM = Math.floor((payableOtMs % 3600000) / 60000);
                            
                            doc.text(`Isenção: primeiras 20h incluídas no vencimento`, 18, summaryY + 17);
                            if (monthlyOvertimeMs <= EXEMPTION_MS) {
                                doc.setTextColor(22, 163, 74); // green-600
                                doc.text(`✓ Dentro da isenção. Horas a Pagar: 0h 0m`, 18, summaryY + 22);
                            } else {
                                doc.setTextColor(220, 38, 38); // red-600
                                doc.text(`! Excedeu a isenção. Horas a Pagar: ${pOtH}h ${pOtM}m`, 18, summaryY + 22);
                            }
                        }
                        summaryY += isExempt ? 30 : 20;
                    }

                    // Signature lines
                    const sigY = Math.max(summaryY + 15, 250);
                    if (sigY > 270) doc.addPage();
                    const finalLineY = sigY > 270 ? 40 : sigY;
                    
                    doc.setFontSize(9);
                    doc.setTextColor(40);
                    doc.text("__________________________", 35, finalLineY);
                    doc.text("Assinatura Colaborador", 42, finalLineY + 5);
                    doc.text("__________________________", 125, finalLineY);
                    doc.text("Assinatura Responsável", 132, finalLineY + 5);
                }

                const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

                const resendKey = process.env.RESEND_API_KEY;
                if (resendKey) {
                    const resend = new Resend(resendKey);
                    const periodStr = `${format(reportMonthStart, 'dd/MM')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}`;
                    await resend.emails.send({
                        from: "Pontual <noreply@pontualidade.pt>",
                        to: reportEmail,
                        reply_to: "comercial@techscire.pt",
                        subject: `Relatório de Assiduidade - Período ${periodStr}`,
                        text: `Olá,\n\nSegue em anexo o relatório consolidado de assiduidade de todos os colaboradores para o período de ${periodStr}.\n\nEste relatório inclui os cálculos de horas extra (após 8h de trabalho) e as isenções configuradas.\n\nAtenciosamente,\nEquipa Pontual`,
                        attachments: [{
                            filename: `Relatorio_Assiduidade_${format(reportMonthStart, 'yyyy_MM_dd')}_a_${format(reportMonthEnd, 'dd')}.pdf`,
                            content: pdfBuffer,
                        }],
                    });
                    results.push({ user: user.username, email: reportEmail, status: "sent" });
                } else {
                    results.push({ user: user.username, status: "Resend API key missing" });
                }
            } catch (err: any) {
                console.error(`Error processing user ${user.username}:`, err);
                results.push({ user: user.username, error: err.message });
            }
        }

        return Response.json({ success: true, processed: results.length, details: results });
    } catch (error: any) {
        console.error("Critical cron error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
