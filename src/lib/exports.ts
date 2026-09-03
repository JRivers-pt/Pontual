import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { EmployeeReportResult, ProcessedDay } from './reports/report-calculator';

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

export async function exportToPDF(data: AttendanceData[], period: string, headerTitle?: string, type: "summary" | "detailed" | "matrix" = "summary", logoUrl?: string, companyName: string = "") {
    const doc = new jsPDF();
    const isDetailed = type === 'detailed';
    const isMatrix = type === 'matrix';
    
    // Header Colors
    const PRIMARY_COLOR = [30, 58, 138]; // #1e3a8a

    if (isMatrix) {
        // Landscape Report
        const landscapeDoc = new jsPDF('l', 'mm', 'a4');
        
        let currentY = 15;
        
        // Add Logo if available
        let textStartX = 14;
        if (logoUrl) {
            const base64Img = await getBase64ImageFromUrl(logoUrl);
            if (base64Img) {
                const imgFormat = base64Img.substring(11, base64Img.indexOf(";base64")).toUpperCase();
                landscapeDoc.addImage(base64Img, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 25, undefined, 'FAST');
                textStartX = 55;
            }
        }
        
        // Header
        landscapeDoc.setFontSize(20);
        landscapeDoc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        landscapeDoc.text(headerTitle || "Pontual | Resumo em Grelha", textStartX, 18);
        
        landscapeDoc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        landscapeDoc.setLineWidth(0.5);
        landscapeDoc.line(14, 28, 282, 28);

        landscapeDoc.setFontSize(10);
        landscapeDoc.setTextColor(100);
        landscapeDoc.text(`Período: ${period}`, 14, 34);
        landscapeDoc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 220, 34);

        const startY = 38;

        // Group by employee
        const employeesMap = new Map<string, { days: Map<string, string>, dept: string, total: string, ot: string }>();
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
        const daysToShow = allDays.length > 31 ? allDays.slice(0, 31) : allDays;
        const dayHeaders = daysToShow.map(dateStr => dateStr.split('/')[0]);

        const tableColumn = ["Nome", "Dep.", ...dayHeaders, "Total", "H.Extra"];
        const tableRows = sortedEmployees.map(empName => {
            const emp = employeesMap.get(empName)!;
            const rowDays = daysToShow.map(day => {
                const duration = emp.days.get(day) || "-";
                const isAbsent = duration === "Falta";
                return { 
                    content: isAbsent ? "F" : duration, 
                    styles: { textColor: isAbsent ? [220, 38, 38] : [0, 0, 0] } 
                };
            });
            
            let totalMs = 0;
            emp.days.forEach(dur => {
                if (dur && dur !== "-" && dur !== "Falta") {
                    const parts = dur.match(/(\d+)h\s*(\d+)m/);
                    if (parts) totalMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
                }
            });
            const h = Math.floor(totalMs / 3600000);
            const m = Math.floor((totalMs % 3600000) / 60000);
            return [
                empName.length > 20 ? empName.substring(0, 18) + '..' : empName,
                emp.dept.substring(0, 10),
                ...rowDays,
                `${h}:${m.toString().padStart(2, '0')}`,
                emp.ot || "00:00"
            ];
        });

        autoTable(landscapeDoc, {
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
            headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
            columnStyles: { 0: { halign: 'left', cellWidth: 35 }, 1: { cellWidth: 15 } }
        });

        landscapeDoc.save(`relatorio_grelha_${new Date().getTime()}.pdf`);
        return;
    }

    if (isDetailed) {
        const employeesMap = new Map<string, AttendanceData[]>();
        data.forEach(item => {
            const empName = item.funcionario || 'Desconhecido';
            if (!employeesMap.has(empName)) employeesMap.set(empName, []);
            employeesMap.get(empName)!.push(item);
        });

        const sortedEmployees = Array.from(employeesMap.keys()).sort();
        let logoBase64 = logoUrl ? await getBase64ImageFromUrl(logoUrl) : "";

        for (let index = 0; index < sortedEmployees.length; index++) {
            const empName = sortedEmployees[index];
            if (index > 0) doc.addPage();

            let textStartX = 14;
            if (logoUrl && logoBase64) {
                const imgFormat = logoBase64.substring(11, logoBase64.indexOf(";base64")).toUpperCase();
                doc.addImage(logoBase64, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 18, undefined, 'FAST');
                textStartX = 55;
            }

            doc.setFontSize(20);
            doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
            doc.text(headerTitle || "Pontual | Relatório Detalhado", textStartX, 22);
            
            doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
            doc.setLineWidth(0.5);
            doc.line(14, 30, 196, 30);

            const empData = employeesMap.get(empName)!;
            doc.setFontSize(10);
            doc.setTextColor(80);
            doc.text(`Colaborador: ${empName}`, 14, 38);
            doc.text(`Departamento: ${empData[0]?.departamento || "Geral"}`, 120, 38);
            doc.text(`Período: ${period}`, 14, 43);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT')}`, 14, 48);

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
                startY: 55,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2.5 },
                headStyles: { fillColor: PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: { 0: { cellWidth: 25 }, 3: { cellWidth: 65 } }
            });

            const finalY = (doc as any).lastAutoTable.finalY + 15;
            const sigY = Math.max(finalY, 255);
            if (sigY > 275) doc.addPage();
            const lineY = sigY > 275 ? 40 : sigY;
            
            doc.setFontSize(9);
            doc.setTextColor(40);
            doc.text("__________________________", 35, lineY);
            doc.text("Assinatura Colaborador", 42, lineY + 5);
            doc.text("__________________________", 125, lineY);
            doc.text("Assinatura Responsável", 132, lineY + 5);
        }
    } else {
        // Summary report
        let textStartX = 14;
        if (logoUrl) {
            const logoBase64 = await getBase64ImageFromUrl(logoUrl);
            if (logoBase64) {
                const imgFormat = logoBase64.substring(11, logoBase64.indexOf(";base64")).toUpperCase();
                doc.addImage(logoBase64, imgFormat === 'PNG' ? 'PNG' : 'JPEG', 14, 12, 35, 18, undefined, 'FAST');
                textStartX = 55;
            }
        }

        doc.setFontSize(20);
        doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.text(headerTitle || "Pontual | Resumo de Assiduidade", textStartX, 22);
        
        doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.setLineWidth(0.5);
        doc.line(14, 30, 196, 30);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Período: ${period}`, 14, 38);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, 150, 38);

        const tableColumn = ["Data", "Funcionário", "Dep.", "Entrada", "Saída", "Duração", "H. Extra"];
        const tableRows = data.map(ticket => [
            ticket.data || '-',
            ticket.funcionario || '-',
            ticket.departamento || '-',
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
            headStyles: { fillColor: PRIMARY_COLOR, textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
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

/**
 * Unificado: gera o relatório com o MESMO layout do serviço mensal automático
 * (pdf-generator.ts) — cabeçalho, box de colaborador (Colaborador/ID/Período),
 * tabela Data/Entrada/Almoço/Saída/Total/Extra/Obs, total e assinaturas.
 * Este é o layout de referência (Gengibre/VE).
 */
export async function exportToStandardPDF(
    data: AttendanceData[],
    period: string,
    headerTitle?: string,
    logoUrl?: string,
    companyName: string = ""
) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PRIMARY_COLOR: [number, number, number] = [30, 58, 138]; // #1e3a8a
    const clientHeader = headerTitle || "Pontual | Relatório de Assiduidade";
    const periodStr = period;

    // Group by employee
    const employeesMap = new Map<string, AttendanceData[]>();
    data.forEach(item => {
        const empName = item.funcionario || 'Desconhecido';
        if (!employeesMap.has(empName)) employeesMap.set(empName, []);
        employeesMap.get(empName)!.push(item);
    });
    const sortedNames = Array.from(employeesMap.keys()).sort();

    sortedNames.forEach((empName, index) => {
        if (index > 0) doc.addPage();

        const empItems = employeesMap.get(empName)!;
        const empId = empItems[0]?.id || '-';

        // Header
        doc.setFontSize(18);
        doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.setFont("helvetica", "bold");
        doc.text(clientHeader, 14, 18);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text("Relatório de Assiduidade Mensal", 14, 24);

        doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.setLineWidth(0.5);
        doc.line(14, 27, 196, 27);

        // Employee Info Box
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.roundedRect(14, 30, 182, 14, 1.5, 1.5, "F");

        // Vertical accent bar
        doc.setFillColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.rect(14, 30, 2.5, 14, "F");

        doc.setFontSize(8);
        doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.setFont("helvetica", "bold");
        doc.text("COLABORADOR", 20, 35);
        doc.text("ID", 105, 35);
        doc.text("PERÍODO", 135, 35);

        doc.setFontSize(10);
        doc.setTextColor(30);
        doc.text(empName, 20, 41);
        doc.text(empId, 105, 41);
        doc.text(periodStr, 135, 41);

        // Build table rows from daily data
        const bodyRows: (string | number)[][] = [];
        let totalWorkMinutes = 0;
        let totalOtMinutes = 0;

        empItems.forEach(item => {
            const entrada = item.entrada || '-';
            const saida = item.saida || '-';
            const almoco = item.almoco || ((item.entrada && item.entrada !== '-' && false) ? '' : '-');
            const durationStr = item.duracao || '-';
            const extraStr = item.horasExtra && item.horasExtra !== '-' ? item.horasExtra : '-';
            const obs = item.estado || '';

            // Sum durations
            const durMatch = item.duracao?.match(/(\d+)h\s*(\d+)m/);
            if (durMatch) totalWorkMinutes += parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]);
            const otMatch = item.horasExtra?.match(/\+?(\d+)h\s*(\d+)m/);
            if (otMatch) totalOtMinutes += parseInt(otMatch[1]) * 60 + parseInt(otMatch[2]);

            bodyRows.push([item.data || '-', entrada, almoco, saida, durationStr, extraStr, obs]);
        });

        // Totals row
        const fmtHms = (min: number) => {
            if (min <= 0) return "0h00m";
            const h = Math.floor(min / 60);
            const m = min % 60;
            return `${h}h${m.toString().padStart(2, '0')}m`;
        };
        const totalsRow = [
            "TOTAL DO PERÍODO:",
            "",
            "",
            "",
            fmtHms(totalWorkMinutes),
            totalOtMinutes > 0 ? fmtHms(totalOtMinutes) : "-",
            ""
        ];

        autoTable(doc, {
            head: [["Data", "Entrada", "Almoço", "Saída", "Total", "Extra", "Obs"]],
            body: [...bodyRows, totalsRow],
            startY: 48,
            theme: "grid",
            styles: {
                fontSize: 8,
                cellPadding: 1.8,
                textColor: [30, 41, 59],
                lineColor: [226, 232, 240],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: PRIMARY_COLOR,
                textColor: [255, 255, 255],
                fontStyle: "bold",
                halign: "center",
                fontSize: 8
            },
            columnStyles: {
                0: { halign: "center", cellWidth: 20 },
                1: { halign: "center", cellWidth: 16 },
                2: { halign: "center", cellWidth: 24 },
                3: { halign: "center", cellWidth: 16 },
                4: { halign: "center", cellWidth: 18 },
                5: { halign: "center", cellWidth: 18 },
                6: { halign: "left" }
            },
            didParseCell: (data: any) => {
                if (data.row.index === bodyRows.length) {
                    data.cell.styles.fontStyle = "bold";
                    data.cell.styles.fillColor = [239, 246, 255];
                    data.cell.styles.textColor = PRIMARY_COLOR;
                    if (data.column.index === 0) {
                        data.cell.colSpan = 4;
                        data.cell.styles.halign = "right";
                    }
                } else if (data.column.index === 6 && data.cell.text[0]) {
                    data.cell.styles.textColor = [217, 119, 6];
                    data.cell.styles.fontStyle = "bold";
                }
            }
        });

        const finalY = (doc as any).lastAutoTable.finalY || 240;
        const nextY = finalY + 6;

        // Signatures Block
        const sigY = Math.max(nextY + 8, 272);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");

        doc.line(30, sigY, 85, sigY);
        doc.text("Assinatura do Colaborador", 38, sigY + 4);

        doc.line(125, sigY, 180, sigY);
        doc.text("Assinatura da Direção / Gestor", 133, sigY + 4);
    });

    doc.save(`Relatorio_Assiduidade_${new Date().getTime()}.pdf`);
}

export async function exportToMensalPDF(
    data: any[], 
    period: string, 
    header?: string,
    logoUrl?: string
) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const PRIMARY_COLOR = [30, 58, 138];
    
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
        
        if (d.duracao !== "Falta" && d.duracao !== "-") {
            const parts = d.duracao.match(/(\d+)h\s*(\d+)m/);
            if (parts) aggregated[name].totalMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
        } else if (d.duracao === "Falta") {
            aggregated[name].absences++;
        }

        if (d.horasExtra && d.horasExtra !== "-") {
            const parts = d.horasExtra.match(/\+?(\d+)h\s*(\d+)m/);
            if (parts) aggregated[name].overtimeMs += (parseInt(parts[1]) * 60 + parseInt(parts[2])) * 60000;
        }

        if (d.isLate) aggregated[name].lates++;
    });

    let textStartX = 15;
    if (logoUrl) {
        try {
            const base64 = await getBase64ImageFromUrl(logoUrl);
            doc.addImage(base64, 'JPEG', 15, 12, 35, 18);
            textStartX = 55;
        } catch (e) { console.error(e); }
    }

    doc.setFontSize(20);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.text(header || "Pontual | Resumo Consolidado", textStartX, 22);
    
    doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setLineWidth(0.5);
    doc.line(15, 32, 195, 32);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${period}`, 15, 40);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, 155, 40);

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

    autoTable(doc, {
        startY: 45,
        head: [['Colaborador', 'Dep.', 'Total Horas', 'H. Extra', 'Faltas', 'Atrasos']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            2: { fontStyle: 'bold' },
            4: { textColor: [220, 38, 38] },
            5: { textColor: [180, 83, 9] }
        }
    });

    doc.save(`Relatorio_Mensal_${new Date().getTime()}.pdf`);
}
