import { prisma } from "@/lib/db";
import { format, parseISO, isWeekend, eachDayOfInterval } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "@/lib/api-server";
import { calculateSmartWorkHours, getClientRules } from "@/lib/schedules";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const veUser = await prisma.user.findFirst({
            where: { 
                OR: [
                    { company: { contains: "Vontade" } },
                    { username: { contains: "vontade" } }
                ],
                apiKey: { not: null },
                apiSecret: { not: null }
            }
        });

        if (!veUser) {
            return Response.json({ error: "VE User not found or no API keys" }, { status: 404 });
        }

        const reportMonthStart = new Date("2026-06-30T00:00:00Z");
        const reportMonthEnd = new Date("2026-07-31T23:59:59Z");
        const beginTime = reportMonthStart.toISOString().replace('Z', '+00:00');
        const endTime = reportMonthEnd.toISOString().replace('Z', '+00:00');

        const token = await getCrossChexToken(veUser.apiKey!, veUser.apiSecret!, veUser.apiUrl || undefined);

        const requestBody = {
            header: {
                nameSpace: "attendance.record",
                nameAction: "getrecord",
                version: "1.0",
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            authorize: { type: "token", token },
            payload: { begin_time: beginTime, end_time: endTime, order: "asc", page: 1, per_page: 5000 }
        };

        const recordsResponse = await fetch(veUser.apiUrl || 'https://api.eu.crosschexcloud.com/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const recordsData = await recordsResponse.json();
        let apiRecords = recordsData.payload?.data || [];

        const missedPunches = await prisma.missedPunch.findMany({
            where: {
                userId: veUser.id,
                checktime: { gte: reportMonthStart, lte: reportMonthEnd }
            }
        });

        const manualRecords = missedPunches.map(mp => ({
            id: mp.id,
            workno: mp.workno,
            firstName: mp.firstName,
            lastName: mp.lastName,
            checktime: format(mp.checktime, "yyyy-MM-dd'T'HH:mm:ss"),
            checktype: mp.checktype,
            device: mp.device
        }));

        const allRecords = [...apiRecords, ...manualRecords];
        
        const employeeMap = new Map();
        for (const r of allRecords) {
            if (!employeeMap.has(r.workno)) {
                employeeMap.set(r.workno, {
                    id: r.workno,
                    name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || `Colaborador ${r.workno}`,
                    records: []
                });
            }
            employeeMap.get(r.workno).records.push(r);
        }

        const employees = Array.from(employeeMap.values()).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        const doc = new jsPDF();
        let isFirstPage = true;
        const rules = getClientRules(veUser.company || "Vontade e Empenho");

        for (const empData of employees) {
            if (!isFirstPage) doc.addPage();
            isFirstPage = false;

            const isVP = veUser.company?.toLowerCase().includes("vontade") || false;
            if (isVP && String(empData.id) === '8') continue;

            const showOvertime = !isVP;
            let monthlyOvertimeMs = 0;

            const PRIMARY_COLOR = [30, 58, 138];
            doc.setFontSize(20);
            doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
            doc.text(veUser.reportHeader || `Pontual | ${veUser.company || 'Relatório'}`, 14, 22);

            doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
            doc.setLineWidth(0.5);
            doc.line(14, 25, 196, 25);

            doc.setFontSize(10);
            doc.setTextColor(80);
            doc.text(`Colaborador: ${empData.name} (${empData.id})`, 14, 33);
            doc.text(`Período: ${format(reportMonthStart, 'dd/MM/yyyy')} a ${format(reportMonthEnd, 'dd/MM/yyyy')}`, 14, 38);
            doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')} (PLATAFORMA)`, 14, 43);

            const daysData = eachDayOfInterval({ start: reportMonthStart, end: reportMonthEnd }).map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayItems = empData.records.filter((r: any) => r.checktime.startsWith(dateStr));

                if (isWeekend(day) && dayItems.length === 0) return null;

                const sorted = dayItems.sort((a: any, b: any) => parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime());
                const first = sorted[0];
                const last = sorted[sorted.length - 1];
                
                const calcChecks = sorted.map((r: any) => ({ time: r.checktime, type: r.checktype }));
                const { totalWorkMs, overtimeHours } = calculateSmartWorkHours(calcChecks, veUser.company || "");
                
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

            const head = [['Data', 'Entrada', 'Saída', 'Duração']];
            if (showOvertime) head[0].push('H. Extra');

            autoTable(doc, {
                startY: 50,
                head,
                body: daysData,
                theme: 'striped',
                headStyles: { fillColor: PRIMARY_COLOR, textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                foot: [[
                    { content: 'TOTAL DO MÊS', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                    `${tH}h ${tM}m`,
                    ...(showOvertime ? [`+${totalOtH}h ${totalOtM}m`] : [])
                ]],
                footStyles: { fillColor: [239, 246, 255], textColor: PRIMARY_COLOR, fontStyle: 'bold' },
            });
        }

        const pdfBuffer = doc.output('arraybuffer');
        
        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="Relatorio_VE_Plataforma.pdf"'
            }
        });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
