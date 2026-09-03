import { prisma } from "@/lib/db";
import { Resend } from "resend";
import { format, subMonths, startOfMonth, endOfMonth, setDate, addMonths, startOfDay, endOfDay } from "date-fns";
import { getCrossChexToken, generateRequestId, generateTimestamp } from "@/lib/api-server";
import {
    EmployeeData,
    ClientReportRules,
    processEmployeeAttendance,
    EmployeeReportResult
} from "./report-calculator";
import { generateReportPdf } from "./pdf-generator";
import { generateReportXlsx } from "./xlsx-generator";

export interface MonthlyReportServiceOptions {
    cycle?: "CALENDAR_MONTH" | "CUTOFF_26_25" | "ALL";
    targetUsername?: string;
    customStartDate?: Date;
    customEndDate?: Date;
    sendEmail?: boolean;
    overrideEmail?: string;
}

export interface ClientExecutionResult {
    username: string;
    company: string;
    recipientEmail: string;
    period: string;
    employeesCount: number;
    pdfSize: number;
    xlsxSize: number;
    emailSent: boolean;
    error?: string;
}

export async function runMonthlyReports(
    options: MonthlyReportServiceOptions = {}
): Promise<{ success: boolean; results: ClientExecutionResult[] }> {
    const {
        cycle = "ALL",
        targetUsername,
        customStartDate,
        customEndDate,
        sendEmail = true,
        overrideEmail
    } = options;

    const whereClause: any = {
        apiKey: { not: null },
        apiSecret: { not: null }
    };

    if (targetUsername) {
        whereClause.username = targetUsername;
    } else {
        whereClause.autoEmailReports = true;
        if (cycle !== "ALL") {
            whereClause.reportCycle = cycle;
        }
    }

    const clients = await prisma.user.findMany({
        where: whereClause
    });

    const results: ClientExecutionResult[] = [];
    const now = new Date();

    for (const client of clients) {
        const clientCompany = client.company || client.username;
        const clientCycle = client.reportCycle || "CALENDAR_MONTH";

        // Determine Start and End Dates
        let startDate: Date;
        let endDate: Date;

        if (customStartDate && customEndDate) {
            startDate = startOfDay(customStartDate);
            endDate = endOfDay(customEndDate);
        } else if (clientCycle === "CUTOFF_26_25") {
            // Cutoff cycle: closed period ending on the 25th of this month (or previous month if run before the 26th)
            if (now.getDate() >= 26) {
                startDate = startOfDay(setDate(subMonths(now, 1), 26));
                endDate = endOfDay(setDate(now, 25));
            } else {
                startDate = startOfDay(setDate(subMonths(now, 2), 26));
                endDate = endOfDay(setDate(subMonths(now, 1), 25));
            }
        } else {
            // Calendar month: full previous month (e.g. 1st to 31st)
            const prevMonth = subMonths(now, 1);
            startDate = startOfMonth(prevMonth);
            endDate = endOfMonth(prevMonth);
        }

        const periodLabel = `${format(startDate, "dd/MM/yyyy")} a ${format(endDate, "dd/MM/yyyy")}`;
        const recipientEmail = overrideEmail || client.vpEmail || client.email || "comercial@techscire.pt";

        try {
            // 1. Get CrossChex Cloud Token
            const token = await getCrossChexToken(client.apiKey!, client.apiSecret!, client.apiUrl || undefined);

            const beginTime = startDate.toISOString().replace("Z", "+00:00");
            const endTime = endDate.toISOString().replace("Z", "+00:00");

            // 2. Fetch Attendance Records
            const requestBody = {
                header: {
                    nameSpace: "attendance.record",
                    nameAction: "getrecord",
                    version: "1.0",
                    requestId: generateRequestId(),
                    timestamp: generateTimestamp()
                },
                authorize: { type: "token", token },
                payload: {
                    begin_time: beginTime,
                    end_time: endTime,
                    order: "asc",
                    page: 1,
                    per_page: 5000
                }
            };

            const recordsResponse = await fetch(client.apiUrl || "https://api.eu.crosschexcloud.com/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!recordsResponse.ok) {
                throw new Error(`CrossChex API error: ${recordsResponse.status}`);
            }

            const recordsData = await recordsResponse.json();
            let rawRecords = recordsData.payload?.list || recordsData.payload?.data || [];

            // 3. Fetch Manual Corrections (MissedPunches) from DB
            const missedPunches = await prisma.missedPunch.findMany({
                where: {
                    userId: client.id,
                    checktime: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            });

            if (missedPunches.length > 0) {
                const mappedMissed = missedPunches.map(mp => ({
                    checktime: mp.checktime.toISOString(),
                    checktype: mp.checktype,
                    employee: {
                        workno: mp.workno,
                        first_name: mp.firstName,
                        last_name: mp.lastName
                    }
                }));
                rawRecords = [...rawRecords, ...mappedMissed];
            }

            // 4. Group by Employee
            const employeeMap = new Map<string, EmployeeData>();

            for (const item of rawRecords) {
                const workno = String(item.employee?.workno || item.workno || "").trim();
                if (!workno) continue;

                const name = `${item.employee?.first_name || item.firstName || ""} ${item.employee?.last_name || item.lastName || ""}`.trim() || `Colaborador ${workno}`;

                if (!employeeMap.has(workno)) {
                    employeeMap.set(workno, {
                        id: workno,
                        name,
                        records: []
                    });
                }

                employeeMap.get(workno)!.records.push({
                    checktime: item.checktime,
                    checktype: item.checktype
                });
            }

            // 5. Client Rules Setup
            const exemptIdsList = (client.exemptIds || "")
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);

            const isGengibre = client.username.toLowerCase().includes("gengibre") ||
                               clientCompany.toLowerCase().includes("gengibre") ||
                               clientCompany.toLowerCase().includes("cozinha criativa");

            const skipIdsList = isGengibre ? ["15"] : []; // Skip ID 15 for Gengibre

            const clientRules: ClientReportRules = {
                exemptIds: exemptIdsList,
                skipIds: skipIdsList,
                overtimeToleranceMinutes: client.overtimeTolerance ?? 5,
                normalDayMinutes: (client.overtimeCapHours ?? 8) * 60,
                lunchAutoDeductMinutes: client.mealBreakMinutes ?? 60,
                lunchThresholdMinutes: (client.mealBreakThresholdHours ?? 6) * 60
            };

            // Filter & Sort Employees
            const sortedEmployees = Array.from(employeeMap.values())
                .filter(e => !clientRules.skipIds.includes(e.id))
                .sort((a, b) => {
                    const numA = parseInt(a.id, 10);
                    const numB = parseInt(b.id, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.name.localeCompare(b.name);
                });

            // 6. Process Attendance for each employee
            const processedEmployees: EmployeeReportResult[] = sortedEmployees.map(emp =>
                processEmployeeAttendance(emp, startDate, endDate, clientRules)
            );

            const clientHeader = client.reportHeader || `Pontual | ${clientCompany}`;

            // 7. Generate PDF
            const pdfBuffer = generateReportPdf({
                clientHeader,
                startDate,
                endDate,
                employees: processedEmployees
            });

            // 8. Generate Excel (.xlsx)
            const xlsxBuffer = generateReportXlsx({
                clientHeader,
                startDate,
                endDate,
                employees: processedEmployees
            });

            // 9. Send Email via Resend
            let emailSent = false;
            if (sendEmail && recipientEmail) {
                const resendKey = process.env.RESEND_API_KEY;
                if (!resendKey) {
                    console.warn(`[WARN] RESEND_API_KEY is not set. Skipping email dispatch.`);
                } else {
                    const resend = new Resend(resendKey);
                    const safePeriodStr = `${format(startDate, "dd/MM")} a ${format(endDate, "dd/MM/yyyy")}`;
                    const sanitizedName = clientCompany.replace(/[^a-zA-Z0-9_-]/g, "_");

                    await resend.emails.send({
                        from: "Pontual <noreply@pontualidade.pt>",
                        to: [recipientEmail],
                        cc: ["comercial@techscire.pt"],
                        replyTo: "comercial@techscire.pt",
                        subject: `Relatório de Assiduidade - ${clientCompany} (${safePeriodStr})`,
                        text: `Olá,\n\nSegue em anexo o relatório mensal de assiduidade de todos os colaboradores da ${clientCompany} para o período de ${safePeriodStr}.\n\nEm anexo encontrará:\n1. Ficheiro PDF com o relatório detalhado e pronto a imprimir\n2. Ficheiro Excel (.xlsx) consolidado para gestão e arquivo\n\nQualquer dúvida ou ajuste necessário, estamos à inteira disposição.\n\nCom os melhores cumprimentos,\nEquipa Pontual\nwww.pontualidade.pt`,
                        attachments: [
                            {
                                filename: `Relatorio_Assiduidade_${sanitizedName}_${format(startDate, "yyyy_MM_dd")}_a_${format(endDate, "dd")}.pdf`,
                                content: pdfBuffer
                            },
                            {
                                filename: `Relatorio_Assiduidade_${sanitizedName}_${format(startDate, "yyyy_MM_dd")}_a_${format(endDate, "dd")}.xlsx`,
                                content: xlsxBuffer
                            }
                        ]
                    });
                    emailSent = true;
                }
            }

            results.push({
                username: client.username,
                company: clientCompany,
                recipientEmail,
                period: periodLabel,
                employeesCount: processedEmployees.length,
                pdfSize: pdfBuffer.length,
                xlsxSize: xlsxBuffer.length,
                emailSent
            });
        } catch (err: any) {
            console.error(`Error processing monthly report for client ${client.username}:`, err);
            results.push({
                username: client.username,
                company: clientCompany,
                recipientEmail,
                period: periodLabel,
                employeesCount: 0,
                pdfSize: 0,
                xlsxSize: 0,
                emailSent: false,
                error: err.message
            });
        }
    }

    return {
        success: results.every(r => !r.error),
        results
    };
}