import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, parseISO, isWeekend, subMonths } from "date-fns";
import { pt } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "@/lib/api-server";

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
        // Fetch all users with automated reports enabled
        const users = await prisma.user.findMany({
            where: { 
                autoEmailReports: true,
                vpEmail: { not: null },
                apiKey: { not: null },
                apiSecret: { not: null }
            }
        });

        if (users.length === 0) {
            return Response.json({ message: "No users configured for automated reports" });
        }

        const results = [];
        const lastMonth = subMonths(new Date(), 1);
        const reportMonthStart = startOfMonth(lastMonth);
        const reportMonthEnd = endOfMonth(lastMonth);
        
        const beginTime = reportMonthStart.toISOString().replace('Z', '+00:00');
        const endTime = reportMonthEnd.toISOString().replace('Z', '+00:00');

        for (const user of users) {
            try {
                const reportEmail = user.vpEmail!;
                
                // Fetch Token
                const token = await getCrossChexToken(user.apiKey!, user.apiSecret!, user.apiUrl || undefined);

                // Fetch Records - using the same logic as the dashboard but for the whole month
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
                        per_page: 5000 // Large limit for monthly report
                    }
                };

                const recordsResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!recordsResponse.ok) {
                    throw new Error(`Cloud API error: ${recordsResponse.status}`);
                }

                const recordsData = await recordsResponse.json();
                const rawRecords = recordsData.payload?.list || [];

                if (rawRecords.length === 0) {
                    results.push({ user: user.username, status: "No records found for period" });
                    continue;
                }

                // Process records by employee
                const employeesMap = new Map();
                rawRecords.forEach((item: any) => {
                    const id = item.employee.workno;
                    if (!employeesMap.has(id)) {
                        employeesMap.set(id, { 
                            name: `${item.employee.first_name} ${item.employee.last_name}`.trim(), 
                            records: [] 
                        });
                    }
                    employeesMap.get(id).records.push(item);
                });

                const doc = new jsPDF();
                let isFirstEmployee = true;

                for (const [empId, empData] of employeesMap) {
                    if (!isFirstEmployee) {
                        doc.addPage();
                    }
                    isFirstEmployee = false;

                    // Page Header
                    doc.setFontSize(18);
                    doc.setTextColor(40, 40, 40);
                    doc.text(user.reportHeader || `Pontual | ${user.company || 'Relatório'}`, 14, 22);

                    doc.setFontSize(11);
                    doc.setTextColor(100);
                    doc.text(`Colaborador: ${empData.name} (${empId})`, 14, 32);
                    doc.text(`Período: ${format(reportMonthStart, 'MMMM yyyy', { locale: pt })}`, 14, 38);
                    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 44);

                    const daysData = eachDayOfInterval({ start: reportMonthStart, end: reportMonthEnd }).map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayItems = empData.records.filter((r: any) => r.checktime.startsWith(dateStr));

                        if (isWeekend(day) && dayItems.length === 0) return null;

                        const sorted = dayItems.sort((a: any, b: any) => parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime());
                        const first = sorted[0];
                        const last = sorted[sorted.length - 1];

                        return [
                            format(day, 'dd/MM'),
                            format(day, 'EEEE', { locale: pt }),
                            first ? format(parseISO(first.checktime), 'HH:mm') : '-',
                            (last && last !== first) ? format(parseISO(last.checktime), 'HH:mm') : '-',
                            dayItems.length > 0 ? 'Presente' : (isWeekend(day) ? 'FDS' : 'Falta')
                        ];
                    }).filter(Boolean);

                    autoTable(doc, {
                        head: [['Data', 'Dia', 'Entrada', 'Saída', 'Estado']],
                        body: daysData as any[][],
                        startY: 52,
                        theme: 'grid',
                        styles: { fontSize: 9, cellPadding: 3 },
                        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                        margin: { left: 14, right: 14 },
                    });
                }

                const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

                const resendKey = process.env.RESEND_API_KEY;
                if (resendKey) {
                    const resend = new Resend(resendKey);
                    await resend.emails.send({
                        from: "Pontual <noreply@pontualidade.pt>",
                        to: reportEmail,
                        subject: `Relatório Mensal de Assiduidade - ${format(reportMonthStart, 'MMMM yyyy', { locale: pt })}`,
                        text: `Olá,\n\nSegue em anexo o relatório consolidado de assiduidade de todos os colaboradores para o mês de ${format(reportMonthStart, 'MMMM yyyy', { locale: pt })}.\n\nAtenciosamente,\nEquipa Pontual`,
                        attachments: [{
                            filename: `Relatorio_Assiduidade_${format(reportMonthStart, 'yyyy_MM')}.pdf`,
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
