import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, parseISO, isWeekend } from "date-fns";
import { pt } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "@/lib/api-server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get("company") || "Vila Peixoto";
    const testEmail = searchParams.get("email");

    try {
        const users = await prisma.user.findMany({
            where: { company: { contains: company } }
        });

        if (users.length === 0) {
            return Response.json({ error: "No users found for company" }, { status: 404 });
        }

        const results = [];

        for (const user of users) {
            const reportEmail = testEmail || user.email;
            if (!reportEmail) continue;

            const monthStart = startOfMonth(new Date());
            const monthEnd = endOfMonth(new Date());
            const beginTime = monthStart.toISOString().replace('Z', '+00:00');
            const endTime = monthEnd.toISOString().replace('Z', '+00:00');

            // Fetch Token
            const token = await getCrossChexToken(user.apiKey!, user.apiSecret!, user.apiUrl || undefined);

            // Fetch Records
            const requestBody = {
                header: {
                    nameSpace: "attendance.record",
                    nameAction: "record",
                    version: "1.0",
                    requestId: generateRequestId(),
                    timestamp: generateTimestamp()
                },
                payload: {
                    beginTime,
                    endTime,
                    order: "checktime"
                }
            };

            const recordsResponse = await fetch(`${user.apiUrl}attendance-record`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const recordsData = await recordsResponse.json();
            const rawRecords = recordsData.payload?.list || [];

            // Process records
            const employeesMap = new Map();
            rawRecords.forEach((item: any) => {
                const id = item.employee.workno;
                if (!employeesMap.has(id)) employeesMap.set(id, { name: `${item.employee.first_name} ${item.employee.last_name}`.trim(), records: [] });
                employeesMap.get(id).records.push(item);
            });

            const doc = new jsPDF();
            let isFirstEmployee = true;

            for (const [empId, empData] of employeesMap) {
                if (!isFirstEmployee) {
                    doc.addPage();
                }
                isFirstEmployee = false;

                // Page Header for each employee
                doc.setFontSize(18);
                doc.setFont("helvetica", "bold");
                doc.text(`Folha de Ponto Mensal - ${user.company}`, 14, 20);

                doc.setFontSize(11);
                doc.setFont("helvetica", "normal");
                doc.text(`Colaborador: ${empData.name} (${empId})`, 14, 30);
                doc.text(`Mes: ${format(new Date(), 'MMMM yyyy', { locale: pt })}`, 14, 36);
                doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 42);

                const daysData = eachDayOfInterval({ start: monthStart, end: monthEnd }).map(day => {
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
                    head: [['Data', 'Dia', 'Entrada', 'Saida', 'Estado']],
                    body: daysData as any[][],
                    startY: 50,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 3 },
                    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                    margin: { left: 14, right: 14 },
                });

                // Footer for the page
                const finalY = (doc as any).lastAutoTable.finalY;
                doc.setFontSize(9);
                doc.setFont("helvetica", "italic");
                doc.text("Assinatura do Colaborador: ___________________________", 14, finalY + 20);
            }

            const pdfArrayBuffer = doc.output('arraybuffer');
            const pdfBuffer = Buffer.from(pdfArrayBuffer);

            if (process.env.RESEND_API_KEY) {
                await resend.emails.send({
                    from: "Pontual <noreply@pontualidade.pt>",
                    to: reportEmail,
                    subject: `Relatorios Individuais Mensais - ${user.company} - ${format(new Date(), 'MMMM yyyy', { locale: pt })}`,
                    text: `Ola,\n\nSegue em anexo o documento contendo as folhas de ponto individuais de todos os colaboradores da ${user.company} para o mes atual.\n\nEste documento inclui uma pagina dedicada para cada funcionario.\n\nAtenciosamente,\nEquipa Pontual`,
                    attachments: [{
                        filename: `Relatorios_Individuais_${format(new Date(), 'yyyy_MM')}.pdf`,
                        content: pdfBuffer,
                    }],
                });
                results.push({ user: user.username, email: reportEmail, status: "sent" });
            } else {
                results.push({ user: user.username, status: "Resend API key missing" });
            }
        }

        return Response.json({ success: true, results });
    } catch (error: any) {
        console.error("Report error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
