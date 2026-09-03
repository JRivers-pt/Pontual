import * as XLSX from "xlsx";
import { format } from "date-fns";
import { EmployeeReportResult } from "./report-calculator";

export interface GenerateXlsxOptions {
    clientHeader: string;
    startDate: Date;
    endDate: Date;
    employees: EmployeeReportResult[];
}

export function generateReportXlsx(options: GenerateXlsxOptions): Buffer {
    const { clientHeader, startDate, endDate, employees } = options;
    const periodStr = `${format(startDate, "dd/MM/yyyy")} a ${format(endDate, "dd/MM/yyyy")}`;

    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];

    // Header block
    rows.push([clientHeader]);
    rows.push([`Relatório de Assiduidade Mensal - Período: ${periodStr}`]);
    rows.push([]);

    for (const emp of employees) {
        rows.push([`Colaborador: ${emp.name} (ID: ${emp.id})`]);
        rows.push(["Data", "Entrada", "Almoço", "Saída", "Total", "Extra", "Obs"]);

        for (const d of emp.days) {
            rows.push([
                d.dateStr,
                d.entrada,
                d.almoco,
                d.saida,
                d.durationStr,
                d.extraStr,
                d.obs
            ]);
        }

        // Totals Row
        rows.push([
            "TOTAL DO PERÍODO:",
            "",
            "",
            "",
            emp.totalWorkStr,
            emp.totalOtStr,
            ""
        ]);

        // Exemption row if applicable
        if (emp.isExempt) {
            rows.push(["Isenção de Horário: as primeiras 20h estão incluídas no vencimento base."]);
            if (emp.totalOtMinutes <= emp.exemptionMinutes) {
                rows.push(["Dentro da isenção. Horas extra a pagar: 0h00m."]);
            } else {
                rows.push([`Excedeu a isenção. Horas extra a pagar: ${emp.payableOtStr}`]);
            }
        }

        rows.push([]); // blank separator
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws["!cols"] = [
        { wch: 14 }, // Data
        { wch: 10 }, // Entrada
        { wch: 16 }, // Almoço
        { wch: 10 }, // Saída
        { wch: 12 }, // Total
        { wch: 12 }, // Extra
        { wch: 45 }  // Obs
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Assiduidade");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}