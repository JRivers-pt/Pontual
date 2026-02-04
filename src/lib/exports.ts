import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Tipos baseados nos dados da UI
interface AttendanceData {
    data: string;
    funcionario: string;
    entrada?: string;
    saida?: string;
    duracao?: string;
    horasExtra?: string;
    id?: string;
    tipo?: string;
    dispositivo?: string;
    [key: string]: any; // Permitir campos adicionais
}

export function exportToPDF(data: AttendanceData[], period: string) {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text("Pontual | VE Vontade e Empenho", 14, 22);

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Período: ${period}`, 14, 30);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, 14, 36);

    // Tabela - usar campos que existem
    const tableColumn = ["Data", "Funcionário", "Entrada", "Saída", "Duração", "Horas Extra"];
    const tableRows: string[][] = [];

    data.forEach(ticket => {
        const ticketData = [
            ticket.data || '-',
            ticket.funcionario || '-',
            ticket.entrada || ticket.tipo || '-',
            ticket.saida || '-',
            ticket.duracao || '-',
            ticket.horasExtra || '-',
        ];
        tableRows.push(ticketData);
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 }, // Blue 600
        alternateRowStyles: { fillColor: [249, 250, 251] } // Neutral 50
    });

    // Save
    doc.save(`relatorio_assiduidade_${new Date().getTime()}.pdf`);
}

export function exportToExcel(data: AttendanceData[]) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório");

    // Gerar buffer e download
    XLSX.writeFile(workbook, `relatorio_assiduidade_${new Date().getTime()}.xlsx`);
}
