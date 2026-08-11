
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@pontualidade.pt';
    console.log(`Checking user: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    console.log(`User: ${user.name}`);
    console.log(`API Key present: ${!!user.apiKey}`);
    console.log(`API Secret present: ${!!user.apiSecret}`);

    if (user.apiKey) {
        console.log(`API Key start: ${user.apiKey.substring(0, 5)}...`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
