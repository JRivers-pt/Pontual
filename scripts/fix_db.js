const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedAdminPass = await bcrypt.hash(adminPass, 8);
    const hashedGengibrePass = await bcrypt.hash('CC2026', 8);

    console.log('Updating admin user...');
    await prisma.user.upsert({
        where: { username: 'admin' },
        update: { role: 'ADMIN', password: hashedAdminPass },
        create: {
            username: 'admin',
            password: hashedAdminPass,
            role: 'ADMIN',
            name: 'Admin'
        }
    });

    console.log('Updating gengibre user...');
    await prisma.user.upsert({
        where: { username: 'gengibre' },
        update: { password: hashedGengibrePass, role: 'CLIENT', company: 'Cozinha Criativa' },
        create: {
            username: 'gengibre',
            password: hashedGengibrePass,
            role: 'CLIENT',
            company: 'Cozinha Criativa',
            name: 'Guilherme'
        }
    });

    console.log('DB updates finished.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
