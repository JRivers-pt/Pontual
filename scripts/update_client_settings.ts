import { prisma } from "../src/lib/db";

async function main() {
    // 1. Update VE
    const ve = await prisma.user.updateMany({
        where: {
            OR: [
                { username: "VE" },
                { company: { contains: "Vontade e Empenho" } }
            ]
        },
        data: {
            vpEmail: "claudiafernandes@ve-imoveis.pt",
            autoEmailReports: true,
            reportCycle: "CALENDAR_MONTH",
            reportHeader: "Pontual | Vontade e Empenho",
            exemptIds: ""
        }
    });
    console.log("VE atualizado:", ve.count);

    // 2. Update Gengibre
    const gengibre = await prisma.user.updateMany({
        where: {
            OR: [
                { username: "Gengibre" },
                { company: { contains: "Cozinha Criativa" } }
            ]
        },
        data: {
            vpEmail: "gengibre@cozinhacriativa.pt",
            autoEmailReports: true,
            reportCycle: "CUTOFF_26_25",
            reportHeader: "Pontual | Cozinha Criativa (Gengibre)",
            exemptIds: "11,18"
        }
    });
    console.log("Gengibre atualizado:", gengibre.count);
}

main().catch(console.error);