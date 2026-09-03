import { runMonthlyReports } from "../src/lib/reports/monthly-report-service";

async function main() {
    console.log("=== TESTE COM DATAS AUTOMÁTICAS POR CICLO ===");

    const result = await runMonthlyReports({
        sendEmail: false
    });

    console.log("Resultados Automáticos:", JSON.stringify(result, null, 2));
}

main().catch(console.error);