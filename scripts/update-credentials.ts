
import { PrismaClient } from '@prisma/client';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function main() {
    console.log('--- Update CrossChex Credentials ---');

    try {
        // 1. Get user email to identify record
        const email = await question('Enter the user email to update: ');

        // 2. act
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.error(`Error: User with email ${email} not found.`);
            process.exit(1);
        }

        console.log(`User found: ${user.name} (${user.id})`);

        // 3. Get new credentials
        const apiKey = await question('Enter new API Key: ');
        const apiSecret = await question('Enter new API Secret: ');

        if (!apiKey || !apiSecret) {
            console.error('API Key and Secret are required.');
            process.exit(1);
        }

        // 4. Update
        await prisma.user.update({
            where: { id: user.id },
            data: {
                apiKey,
                apiSecret,
                updatedAt: new Date()
            }
        });

        console.log('✅ Credentials updated successfully!');

    } catch (error) {
        console.error('Error updating credentials:', error);
    } finally {
        await prisma.$disconnect();
        rl.close();
    }
}

main();
