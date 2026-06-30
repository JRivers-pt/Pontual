import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Tipos baseados nos dados da UI
interface AttendanceData {
    data: string;
    funcionario?: string;
    entrada?: string;
    saida?: string;
    duracao?: string;
    horasExtra?: string;
    id?: string;
    tipo?: string;
    dispositivo?: string;
    dia?: string;
    estado?: string;
    [key: string]: any; // Permitir campos adicionais
}


async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
    try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to load image for PDF:", e);
        return "";
    }
}

export async function exportToPDF(data: AttendanceData[], period: string, headerTitle?: string, type: "summary" | "detailed" | "matrix" | "timesheet" = "summary", logoUrl?: string) {
    const doc = new jsPDF();
    const isDetailed = type === 'detailed';
    const isMatrix = type === 'matrix';
    const isTimesheet = type === 'timesheet';

    if (isMatrix) {
        // Landscape Report
        const landscapeDoc = new jsPDF('l', 'mm', 'a4');
        
        let currentY = 15;
        
        // Add Logo if available
        let textStartX = 14;
        if (logoUrl) {
            const base64Img = await getBase64ImageFromUrl(logoUrl);
            if (base64Img) {
                // Determine image type based on base64 string
                const imgFormat = base64Img.substring(11, base64Img.indexOf(";base64")).toUpperCase();
                
                // Fixed size for logo: 35x25 roughly
                landscapeDoc.addImage(base64Img, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 25, undefined, 'FAST');
                textStartX = 55; // Move text to the right
            }
        }
        
        // Header
        landscapeDoc.setFontSize(16);
        landscapeDoc.setTextColor(40, 40, 40);
        landscapeDoc.text(headerTitle || "Pontual | Resumo Mensal em Grelha (24h)", textStartX, 18);
        
        landscapeDoc.setFontSize(10);
        landscapeDoc.setTextColor(100);
        landscapeDoc.text(`Período: ${period}`, textStartX, 25);
        if (data.some(d => d.duracao === "Falta")) {
            const absences = new Set(data.filter(d => d.duracao === "Falta").map(d => `${d.id}_${d.data}`)).size;
            landscapeDoc.text(`Ausências (Faltas): ${absences}`, 150, 25);
        }
        landscapeDoc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 220, 25);

        const startY = logoUrl ? 40 : 32;

        // Group by employee
        const employeesMap = new Map<string, { days: Map<string, string>, dept: string, total: string, ot: string }>();
        
        // Get all unique days in month from data (sorted)
        const allDays = Array.from(new Set(data.map(item => item.data))).filter(d => d).sort();
        
        data.forEach(item => {
            const empName = item.funcionario || 'Desconhecido';
            if (!employeesMap.has(empName)) {
                employeesMap.set(empName, { 
                    days: new Map(), 
                    dept: item.departamento || item.department || "Geral",
                    total: "00:00",
                    ot: "00:00"
                });
            }
            const emp = employeesMap.get(empName)!;
            emp.days.set(item.data!, item.duracao || "00:00");
        });

        const sortedEmployees = Array.from(employeesMap.keys()).sort();

        // Table Columns: Name, Dept, Day1, Day2... Day31, Total
        // Since we might have many days, we take the days present in the current filter
        const daysToShow = allDays.length > 31 ? allDays.slice(0, 31) : allDays;
        const dayHeaders = daysToShow.map(dateStr => {
            const d = dateStr.split('/')[0]; // Just the day number
            return d;
        });

        const tableColumn = ["Nome", "Dep.", ...dayHeaders, "Total", "H.Extra"];
        const tableRows = sortedEmployees.map(empName => {
            const emp = employeesMap.get(empName)!;
            const rowDays = daysToShow.map(day => {
                const duration = emp.days.get(day) || "-";
                const isAbsent = duration === "Falta";
                const textColor: [number, number, number] = isAbsent ? [220, 38, 38] : [0, 0, 0];
                return { 
                    content: isAbsent ? "F" : duration, 
                    styles: { textColor } 
                };
            });
            
            // Calculate total for the row
            let totalMs = 0;
            emp.days.forEach(dur => {
                if (dur && dur !== "-" && dur !== "Falta") { // Exclude "Falta" from total duration calculation
                    const parts = dur.match(/(\d+)h\s*(\d+)m/);
                    if (parts) totalMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
                }
            });
            const h = Math.floor(totalMs / 3600000);
            const m = Math.floor((totalMs % 3600000) / 60000);
            const totalStr = `${h}:${m.toString().padStart(2, '0')}`;

            return [
                empName.length > 20 ? empName.substring(0, 18) + '..' : empName,
                emp.dept.substring(0, 10),
                ...rowDays,
                totalStr,
                emp.ot || "00:00"
            ];
        });

        autoTable(landscapeDoc, {
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            columnStyles: {
                0: { halign: 'left', cellWidth: 35 },
                1: { cellWidth: 15 },
            }
        });

        landscapeDoc.save(`relatorio_grelha_${new Date().getTime()}.pdf`);
        return;
    }

    if (isDetailed) {
        // Group by employee for detailed report (one or more pages per employee)
        const employeesMap = new Map<string, AttendanceData[]>();
        data.forEach(item => {
            const empName = item.funcionario || 'Desconhecido';
            if (!employeesMap.has(empName)) employeesMap.set(empName, []);
            employeesMap.get(empName)!.push(item);
        });

        const sortedEmployees = Array.from(employeesMap.keys()).sort();

        let currentY = 22;
        let textStartX = 14;
        let logoBase64 = "";

        if (logoUrl) {
            logoBase64 = await getBase64ImageFromUrl(logoUrl);
        }

        for (let index = 0; index < sortedEmployees.length; index++) {
            const empName = sortedEmployees[index];
            if (index > 0) doc.addPage();

            currentY = 22;
            textStartX = 14;

            if (logoUrl && logoBase64) {
                const imgFormat = logoBase64.substring(11, logoBase64.indexOf(";base64")).toUpperCase();
                doc.addImage(logoBase64, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 25, undefined, 'FAST');
                textStartX = 55;
            }

            const empData = employeesMap.get(empName)!;

            // Header for each employee
            doc.setFontSize(18);
            doc.setTextColor(40, 40, 40);
            doc.text(headerTitle || "Pontual | Relatório de Assiduidade", textStartX, 22);

            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Colaborador: ${empName}`, textStartX, 30);
            doc.text(`Departamento: ${empData[0]?.departamento || empData[0]?.department || "Geral"}`, textStartX + 80, 30);
            doc.text(`Período: ${period}`, textStartX, 36);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, textStartX, 42);

            const startY = logoUrl && logoBase64 ? 48 : 50;

            const tableColumn = ["Data", "Entrada", "Saída", "Movimentos", "Duração", "H. Extra"];
            const tableRows = empData.map(ticket => [
                ticket.data || '-',
                ticket.entrada || '-',
                ticket.saida || '-',
                ticket.movimentos || '-',
                ticket.duracao || '-',
                ticket.horasExtra || '-',
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: startY,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                alternateRowStyles: { fillColor: [249, 250, 251] },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 20 },
                    2: { cellWidth: 20 },
                    3: { cellWidth: 70 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 25 },
                }
            });

            // Signature area at the bottom of employee report
            const finalY = (doc as any).lastAutoTable.finalY + 20;
            if (finalY < 250) {
                doc.setFontSize(10);
                doc.setTextColor(50);
                doc.text("__________________________________", 30, finalY + 10);
                doc.text("Assinatura do Colaborador", 35, finalY + 16);

                doc.text("__________________________________", 120, finalY + 10);
                doc.text("Assinatura do Responsável", 125, finalY + 16);
            } else {
                doc.addPage();
                doc.setFontSize(10);
                doc.setTextColor(50);
                doc.text("__________________________________", 30, 40);
                doc.text("Assinatura do Colaborador", 35, 46);

                doc.text("__________________________________", 120, 40);
                doc.text("Assinatura do Responsável", 125, 46);
            }
        }
    } else if (isTimesheet) {
        let textStartX = 14;
        let startY = 45;

        if (logoUrl) {
            const logoBase64 = await getBase64ImageFromUrl(logoUrl);
            if (logoBase64) {
                const imgFormat = logoBase64.substring(11, logoBase64.indexOf(";base64")).toUpperCase();
                doc.addImage(logoBase64, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 25, undefined, 'FAST');
                textStartX = 55;
                startY = 48;
            }
        }

        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text(headerTitle || "Pontual | Folha de Ponto", textStartX, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(period, textStartX, 30);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, textStartX, 36);

        const tableColumn = ["Data", "Dia", "Entrada", "Saída", "Duração", "H. Extra", "Estado", "Observações"];
        const tableRows = data.map(ticket => [
            ticket.data || '-',
            ticket.dia || '-',
            ticket.entrada || '-',
            ticket.saida || '-',
            ticket.duracao || '-',
            ticket.horasExtra || '-',
            ticket.estado || '-',
            ticket.observacoes || '-',
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5, halign: 'center' },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
        });

        // Signature area
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        if (finalY < 250) {
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.text("__________________________________", 30, finalY + 10);
            doc.text("Assinatura do Colaborador", 35, finalY + 16);

            doc.text("__________________________________", 120, finalY + 10);
            doc.text("Assinatura do Responsável", 125, finalY + 16);
        }
    } else {
        let textStartX = 14;
        let startY = 45;

        if (logoUrl) {
            const logoBase64 = await getBase64ImageFromUrl(logoUrl);
            if (logoBase64) {
                const imgFormat = logoBase64.substring(11, logoBase64.indexOf(";base64")).toUpperCase();
                doc.addImage(logoBase64, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 25, undefined, 'FAST');
                textStartX = 55;
                startY = 48;
            }
        }

        // Summary report (compact, one single table for all)
        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text(headerTitle || "Pontual | Resumo de Assiduidade", textStartX, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Período: ${period}`, textStartX, 30);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, textStartX, 36);

        const tableColumn = ["Data", "Funcionário", "Dep.", "Entrada", "Saída", "Duração", "H. Extra"];
        const tableRows = data.map(ticket => [
            ticket.data || '-',
            ticket.funcionario || '-',
            ticket.departamento || ticket.department || '-',
            ticket.entrada || '-',
            ticket.saida || '-',
            ticket.duracao || '-',
            ticket.horasExtra || '-',
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            columnStyles: {
                2: { cellWidth: 20 }
            }
        });
    }

    doc.save(`relatorio_${type}_${new Date().getTime()}.pdf`);
}

export function exportToExcel(data: AttendanceData[]) {
    if (data.length === 0) return;

    // 1. Get all unique dates sorted chronologically
    const parseDate = (dStr: string) => {
        const [d, m, y] = dStr.split('/').map(Number);
        return new Date(y, m - 1, d);
    };

    const uniqueDates = Array.from(new Set(data.map(d => d.data))).filter(Boolean);
    uniqueDates.sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime());

    // Generate list of days of the month (e.g., 1, 2, 3...)
    const dayHeaders = uniqueDates.map(dateStr => {
        return dateStr.split('/')[0]; // The day part, e.g. "01"
    });

    // 2. Group by employee name/ID
    const employeeGroups: Record<string, {
        id: string;
        name: string;
        dept: string;
        days: Record<string, { entrada: string, saida: string, duracao: string, horasExtra: string, isLate?: boolean }>;
    }> = {};

    data.forEach(row => {
        const key = row.id_funcionario || row.funcionario || 'default';
        if (!employeeGroups[key]) {
            employeeGroups[key] = {
                id: row.id_funcionario || '-',
                name: row.funcionario || 'Desconhecido',
                dept: row.departamento || '-',
                days: {}
            };
        }
        employeeGroups[key].days[row.data] = {
            entrada: row.entrada || '-',
            saida: row.saida || '-',
            duracao: row.duracao_total || '-',
            horasExtra: row.horas_extra || '-',
            isLate: row.isLate
        };
    });

    // 3. Prepare Sheet 1: Matrix Grid ("Resumo Mensal")
    const matrixRows: any[] = [];
    
    // Header for Matrix
    const matrixHeader = [
        "Nº Colaborador",
        "Nome",
        "Departamento",
        ...dayHeaders,
        "Dias Trabalhados",
        "Faltas",
        "Atrasos",
        "Horas Trabalhadas",
        "H. Extra Trabalhadas",
        "H. Extra a Pagar"
    ];

    Object.values(employeeGroups).forEach(emp => {
        let workedDaysCount = 0;
        let absencesCount = 0;
        let latesCount = 0;
        let totalWorkedMs = 0;
        let totalOvertimeMs = 0;

        const dayColumns = uniqueDates.map(dateStr => {
            const dayRecord = emp.days[dateStr];
            if (!dayRecord) {
                const dateObj = parseDate(dateStr);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                return isWeekend ? "FIM" : "-";
            }

            if (dayRecord.duracao === "Falta") {
                absencesCount++;
                return "F";
            }

            workedDaysCount++;
            if (dayRecord.isLate) {
                latesCount++;
            }

            // Sum duration
            const workParts = dayRecord.duracao.match(/(\d+)h\s*(\d+)m/);
            if (workParts) {
                totalWorkedMs += (parseInt(workParts[1]) * 60 + parseInt(workParts[2])) * 60000;
            }

            // Sum overtime
            if (dayRecord.horasExtra && dayRecord.horasExtra !== "-") {
                const otParts = dayRecord.horasExtra.match(/\+?(\d+)h\s*(\d+)m/);
                if (otParts) {
                    totalOvertimeMs += (parseInt(otParts[1]) * 60 + parseInt(otParts[2])) * 60000;
                }
            }

            // Show time range (e.g. 08:30-17:30)
            if (dayRecord.entrada !== "-" && dayRecord.saida !== "-") {
                return `${dayRecord.entrada}-${dayRecord.saida}`;
            } else if (dayRecord.entrada !== "-") {
                return `${dayRecord.entrada}-`;
            } else if (dayRecord.saida !== "-") {
                return `-${dayRecord.saida}`;
            }
            return "-";
        });

        // Format total work time
        const workHours = Math.floor(totalWorkedMs / 3600000);
        const workMins = Math.floor((totalWorkedMs % 3600000) / 60000);
        const totalWorkStr = `${workHours}h ${workMins.toString().padStart(2, '0')}m`;

        // Format total overtime
        const otHours = Math.floor(totalOvertimeMs / 3600000);
        const otMins = Math.floor((totalOvertimeMs % 3600000) / 60000);
        const totalOtStr = totalOvertimeMs > 0 ? `${otHours}h ${otMins.toString().padStart(2, '0')}m` : "-";

        // Paid overtime calculation (20 hours exemption for Ademir and Evelyn)
        const empNameLower = emp.name.toLowerCase();
        const isExempt = empNameLower.includes("ademir") || empNameLower.includes("evelyn");
        const paidOvertimeMs = isExempt ? Math.max(0, totalOvertimeMs - 20 * 60 * 60 * 1000) : totalOvertimeMs;

        const paidOtHours = Math.floor(paidOvertimeMs / 3600000);
        const paidOtMins = Math.floor((paidOvertimeMs % 3600000) / 60000);
        const paidOtStr = paidOvertimeMs > 0 ? `${paidOtHours}h ${paidOtMins.toString().padStart(2, '0')}m` : "-";

        matrixRows.push([
            emp.id,
            emp.name,
            emp.dept,
            ...dayColumns,
            workedDaysCount,
            absencesCount,
            latesCount,
            totalWorkStr,
            totalOtStr,
            paidOtStr
        ]);
    });

    const matrixWorksheet = XLSX.utils.aoa_to_sheet([matrixHeader, ...matrixRows]);

    // 4. Prepare Sheet 2: Detailed logs
    const detailedHeader = [
        "Data",
        "Nº Colaborador",
        "Nome",
        "Departamento",
        "Entrada",
        "Saída",
        "Duração Total",
        "Horas Extra",
        "Movimentos",
        "Atrasado"
    ];

    const detailedRows = data.map(row => [
        row.data,
        row.id_funcionario,
        row.funcionario,
        row.departamento,
        row.entrada,
        row.saida,
        row.duracao_total,
        row.horas_extra,
        row.movimentos,
        row.isLate ? "Sim" : "Não"
    ]);

    const detailedWorksheet = XLSX.utils.aoa_to_sheet([detailedHeader, ...detailedRows]);

    // Set column widths for better readability
    const matrixCols = [
        { wch: 15 }, // ID
        { wch: 25 }, // Name
        { wch: 15 }, // Dept
        ...dayHeaders.map(() => ({ wch: 13 })), // Days
        { wch: 16 }, // Worked Days
        { wch: 10 }, // Absences
        { wch: 10 }, // Lates
        { wch: 18 }, // Total Hours
        { wch: 18 }, // Overtime Worked
        { wch: 18 }  // Overtime to Pay
    ];
    matrixWorksheet['!cols'] = matrixCols;

    const detailedCols = [
        { wch: 12 }, // Date
        { wch: 15 }, // ID
        { wch: 25 }, // Name
        { wch: 15 }, // Dept
        { wch: 10 }, // In
        { wch: 10 }, // Out
        { wch: 15 }, // Duration
        { wch: 12 }, // OT
        { wch: 35 }, // Punches
        { wch: 10 }  // Is Late
    ];
    detailedWorksheet['!cols'] = detailedCols;

    // Create workbook and append sheets
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, matrixWorksheet, "Grelha Mensal");
    XLSX.utils.book_append_sheet(workbook, detailedWorksheet, "Registos Detalhados");

    // Write file
    XLSX.writeFile(workbook, `Relatorio_Mensal_Assiduidade_${new Date().getTime()}.xlsx`);
}

export async function exportToMensalPDF(
    data: any[], 
    period: string, 
    header?: string,
    logoUrl?: string
) {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Aggregate data by employee
    const aggregated: Record<string, any> = {};
    data.forEach(d => {
        const name = d.funcionario;
        if (!aggregated[name]) {
            aggregated[name] = {
                name,
                id: d.id,
                dept: d.departamento,
                totalMs: 0,
                overtimeMs: 0,
                absences: 0,
                lates: 0
            };
        }
        
        // Sum duration
        if (d.duracao !== "Falta" && d.duracao !== "-") {
            const parts = d.duracao.match(/(\d+)h\s*(\d+)m/);
            if (parts) aggregated[name].totalMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
        } else if (d.duracao === "Falta") {
            aggregated[name].absences++;
        }

        // Sum overtime
        if (d.horasExtra && d.horasExtra !== "-") {
            const parts = d.horasExtra.match(/\+?(\d+)h\s*(\d+)m/);
            if (parts) aggregated[name].overtimeMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
        }

        if (d.isLate) aggregated[name].lates++;
    });

    // Logo and Header
    let currentY = 15;
    if (logoUrl) {
        try {
            const base64 = await getBase64ImageFromUrl(logoUrl);
            doc.addImage(base64, 'JPEG', 15, currentY, 30, 15);
        } catch (e) {
            console.error(e);
        }
    }

    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text(header || "Relatório Mensal de Assiduidade", logoUrl ? 50 : 15, currentY + 7);
    
    currentY += 20;

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${period}`, 15, currentY);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, 150, currentY);

    currentY += 10;

    const tableRows = Object.values(aggregated).map(emp => {
        const h = Math.floor(emp.totalMs / 3600000);
        const m = Math.floor((emp.totalMs % 3600000) / 60000);
        const oh = Math.floor(emp.overtimeMs / 3600000);
        const om = Math.floor((emp.overtimeMs % 3600000) / 60000);

        const empNameLower = emp.name.toLowerCase();
        const isExempt = empNameLower.includes("ademir") || empNameLower.includes("evelyn");
        const paidOvertimeMs = isExempt ? Math.max(0, emp.overtimeMs - 20 * 60 * 60 * 1000) : emp.overtimeMs;
        const poh = Math.floor(paidOvertimeMs / 3600000);
        const pom = Math.floor((paidOvertimeMs % 3600000) / 60000);

        return [
            emp.name,
            emp.dept,
            `${h}h ${m}m`,
            emp.overtimeMs > 0 ? `+${oh}h ${om}m` : "-",
            paidOvertimeMs > 0 ? `+${poh}h ${pom}m` : "-",
            emp.absences > 0 ? emp.absences : "0",
            emp.lates > 0 ? emp.lates : "0"
        ];
    });

    (doc as any).autoTable({
        startY: currentY,
        head: [['Colaborador', 'Dep.', 'Total Horas', 'H. Extra Trab.', 'H. Extra a Pagar', 'Faltas', 'Atrasos']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
            2: { fontStyle: 'bold' },
            5: { textColor: [220, 38, 38] },
            6: { textColor: [180, 83, 9] }
        }
    });

    doc.save(`Relatorio_Mensal_${new Date().getTime()}.pdf`);
}
