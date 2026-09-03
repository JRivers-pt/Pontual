import { prisma } from "../src/lib/db";

async function main() {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            company: true,
            email: true,
            vpEmail: true,
            autoEmailReports: true,
            reportCycle: true,
            exemptIds: true,
            apiKey: true,
            apiSecret: true
        }
    });

    console.log("=== UTILIZADORES NA BASE DE DADOS ===");
    users.forEach(u => {
        console.log(`- ID: ${u.id} | User: ${u.username} | Empresa: ${u.company} | Email: ${u.email} | vpEmail: ${u.vpEmail} | auto: ${u.autoEmailReports} | cycle: ${u.reportCycle} | exemptIds: ${u.exemptIds} | hasApiKey: ${!!u.apiKey}`);
    });
}

main().catch(console.error);