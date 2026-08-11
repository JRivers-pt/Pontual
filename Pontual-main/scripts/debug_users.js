const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    console.log('Total users:', users.length);
    users.forEach(u => {
        console.log(`- Username: ${u.username}`);
        console.log(`  Name: ${u.name}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  Company: ${u.company}`);
        console.log('-------------------');
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
