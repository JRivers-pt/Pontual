import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { EmployeeReportResult } from "./report-calculator";

export interface GeneratePdfOptions {
    clientHeader: string; // e.g. "Pontual | Vontade e Empenho"
    startDate: Date;
    endDate: Date;
    employees: EmployeeReportResult[];
}

export function generateReportPdf(options: GeneratePdfOptions): Buffer {
    const { clientHeader, startDate, endDate, employees } = options;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PRIMARY_COLOR: [number, number, number] = [30, 58, 138]; // #1e3a8a
    const periodStr = `${format(startDate, "dd/MM/yyyy")} a ${format(endDate, "dd/MM/yyyy")}`;

    employees.forEach((emp, index) => {
        if (index > 0) {
            doc.addPage();
        }

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
        doc.setFillColor(241, 245, 249); // #f1f5f9
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
        doc.text(emp.name, 20, 41);
        doc.text(emp.id, 105, 41);
        doc.text(periodStr, 135, 41);

        // Build Table Rows
        const bodyRows: (string | number)[][] = [];

        emp.days.forEach(d => {
            bodyRows.push([
                d.dateStr,
                d.entrada,
                d.almoco,
                d.saida,
                d.durationStr,
                d.extraStr,
                d.obs
            ]);
        });

        // Totals row
        const totalsRow = [
            "TOTAL DO PERÍODO:",
            "",
            "",
            "",
            emp.totalWorkStr,
            emp.totalOtStr,
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
            didParseCell: (data) => {
                // Style the Totals Row
                if (data.row.index === bodyRows.length) {
                    data.cell.styles.fontStyle = "bold";
                    data.cell.styles.fillColor = [239, 246, 255]; // #eff6ff
                    data.cell.styles.textColor = PRIMARY_COLOR;
                    if (data.column.index === 0) {
                        data.cell.colSpan = 4;
                        data.cell.styles.halign = "right";
                    }
                } else {
                    // Weekend styling
                    const day = emp.days[data.row.index];
                    if (day && day.isWeekend && day.entrada === "-") {
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.textColor = [148, 163, 184];
                    }
                    // Observation column highlight
                    if (data.column.index === 6 && data.cell.text[0]) {
                        data.cell.styles.textColor = [217, 119, 6]; // amber-600
                        data.cell.styles.fontStyle = "bold";
                    }
                }
            }
        });

        const finalY = (doc as any).lastAutoTable.finalY || 240;
        let nextY = finalY + 6;

        // Exemption summary box if applicable
        if (emp.isExempt) {
            doc.setFillColor(254, 243, 199); // amber-100
            doc.setDrawColor(245, 158, 11); // amber-500
            doc.roundedRect(14, nextY, 182, 14, 1.5, 1.5, "FD");

            doc.setFontSize(8.5);
            doc.setTextColor(146, 64, 14); // amber-800
            doc.setFont("helvetica", "bold");
            doc.text("Isenção de Horário: as primeiras 20h de trabalho extra estão incluídas no vencimento base.", 18, nextY + 5);

            doc.setFont("helvetica", "normal");
            if (emp.totalOtMinutes <= emp.exemptionMinutes) {
                doc.text("Dentro da isenção. Horas extra a pagar: 0h00m.", 18, nextY + 10);
            } else {
                doc.setFont("helvetica", "bold");
                doc.text(`Excedeu a isenção. Horas extra a pagar: ${emp.payableOtStr}`, 18, nextY + 10);
            }
            nextY += 18;
        }

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

    const arrayBuffer = doc.output("arraybuffer");
    return Buffer.from(arrayBuffer);
}