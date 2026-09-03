import { runMonthlyReports } from "../src/lib/reports/monthly-report-service";
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("=== TESTE DA AUTOMAÇÃO DE RELATÓRIOS MENSAIS ===");

    // 1. Run for VE (Calendar month of August 2026)
    console.log("\n-> A testar geração para VE (Vontade e Empenho)...");
    const veResult = await runMonthlyReports({
        targetUsername: "VE",
        customStartDate: new Date("2026-08-01T00:00:00Z"),
        customEndDate: new Date("2026-08-31T23:59:59Z"),
        sendEmail: false
    });

    console.log("Resultado VE:", JSON.stringify(veResult, null, 2));

    // 2. Run for Gengibre (Cutoff 26/07 to 25/08/2026)
    console.log("\n-> A testar geração para Gengibre...");
    const gengibreResult = await runMonthlyReports({
        targetUsername: "Gengibre",
        customStartDate: new Date("2026-07-26T00:00:00Z"),
        customEndDate: new Date("2026-08-25T23:59:59Z"),
        sendEmail: false
    });

    console.log("Resultado Gengibre:", JSON.stringify(gengibreResult, null, 2));
}

main().catch(console.error);