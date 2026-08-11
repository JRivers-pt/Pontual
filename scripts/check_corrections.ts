import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Fetching users to find 'Vontade e Empenho'...");
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { company: { contains: 'Vontade', mode: 'insensitive' } },
                    { username: { contains: 'vontade', mode: 'insensitive' } }
                ]
            }
        });

        if (users.length === 0) {
            console.log("Could not find VE user.");
            return;
        }

        const veUser = users[0];
        console.log(`Found User: ${veUser.username} (${veUser.company}) - ID: ${veUser.id}`);

        console.log("\nFetching manual corrections (MissedPunches)...");
        const corrections = await prisma.missedPunch.findMany({
            where: { userId: veUser.id },
            orderBy: { checktime: 'asc' }
        });

        if (corrections.length === 0) {
            console.log("\n✅ No manual corrections found for this client.");
        } else {
            console.log(`\nFound ${corrections.length} manual corrections:\n`);
            corrections.forEach(c => {
                const typeMap: Record<number, string> = {
                    0: 'Entrada',
                    1: 'Saída',
                    2: 'Início Almoço',
                    3: 'Fim Almoço'
                };
                console.log(`- ${format(c.checktime, 'dd/MM/yyyy HH:mm')} | ${c.firstName} ${c.lastName} (ID: ${c.workno}) | Tipo: ${typeMap[c.checktype] ?? c.checktype} | ${c.device}`);
            });
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
