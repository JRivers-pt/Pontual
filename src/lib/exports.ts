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
        });
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
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório");

    // Gerar buffer e download
    XLSX.writeFile(workbook, `relatorio_assiduidade_${new Date().getTime()}.xlsx`);
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

        return [
            emp.name,
            emp.dept,
            `${h}h ${m}m`,
            emp.overtimeMs > 0 ? `+${oh}h ${om}m` : "-",
            emp.absences > 0 ? emp.absences : "0",
            emp.lates > 0 ? emp.lates : "0"
        ];
    });

    (doc as any).autoTable({
        startY: currentY,
        head: [['Colaborador', 'Dep.', 'Total Horas', 'H. Extra', 'Faltas', 'Atrasos']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            2: { fontStyle: 'bold' },
            4: { textColor: [220, 38, 38] },
            5: { textColor: [180, 83, 9] }
        }
    });

    doc.save(`Relatorio_Mensal_${new Date().getTime()}.pdf`);
}
