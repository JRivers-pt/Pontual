
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('--- Listing Users ---');
    const users = await prisma.user.findMany();

    if (users.length === 0) {
        console.log('No users found in the database.');
    } else {
        users.forEach(user => {
            console.log(`ID: ${user.id} | Email: ${user.email} | Name: ${user.name}`);
        });
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
