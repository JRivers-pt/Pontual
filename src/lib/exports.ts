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


export function exportToPDF(data: AttendanceData[], period: string, headerTitle?: string, type: "summary" | "detailed" | "matrix" = "summary") {
    const doc = new jsPDF();
    const isDetailed = type === 'detailed';
    const isMatrix = type === 'matrix';

    if (isMatrix) {
        // Landscape Report
        const landscapeDoc = new jsPDF('l', 'mm', 'a4');
        
        // Header
        landscapeDoc.setFontSize(16);
        landscapeDoc.setTextColor(40, 40, 40);
        landscapeDoc.text(headerTitle || "Pontual | Resumo Mensal em Grelha (24h)", 14, 15);
        
        landscapeDoc.setFontSize(10);
        landscapeDoc.setTextColor(100);
        landscapeDoc.text(`Período: ${period}`, 14, 22);
        landscapeDoc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 220, 22);

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
            const rowDays = daysToShow.map(day => emp.days.get(day) || "-");
            
            // Calculate total for the row
            let totalMs = 0;
            emp.days.forEach(dur => {
                if (dur && dur !== "-") {
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
                "0:00" // OT placeholder
            ];
        });

        autoTable(landscapeDoc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
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

        sortedEmployees.forEach((empName, index) => {
            if (index > 0) doc.addPage();

            const empData = employeesMap.get(empName)!;

            // Header for each employee
            doc.setFontSize(18);
            doc.setTextColor(40, 40, 40);
            doc.text(headerTitle || "Pontual | Relatório de Assiduidade", 14, 22);

            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Colaborador: ${empName}`, 14, 30);
            doc.text(`Departamento: ${empData[0]?.departamento || empData[0]?.department || "N/A"}`, 80, 30);
            doc.text(`Período: ${period}`, 14, 36);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 14, 42);

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
                startY: 50,
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
    } else {
        // Summary report (compact, one single table for all)
        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text(headerTitle || "Pontual | Resumo de Assiduidade", 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Período: ${period}`, 14, 30);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 14, 36);

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
            startY: 45,
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
