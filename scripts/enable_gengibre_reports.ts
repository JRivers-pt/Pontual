// Script to enable automated reports for Gengibre client
// Run with: npx tsx scripts/enable_gengibre_reports.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Looking for Gengibre user...');

    // Find the Gengibre user
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { company: { contains: 'Cozinha Criativa', mode: 'insensitive' } },
                { company: { contains: 'Gengibre', mode: 'insensitive' } },
                { username: { contains: 'gengibre', mode: 'insensitive' } },
            ]
        }
    });

    if (!user) {
        console.error('❌ Gengibre user not found! Check the company name in the database.');
        const allUsers = await prisma.user.findMany({ select: { id: true, username: true, company: true, vpEmail: true, autoEmailReports: true } });
        console.log('\n📋 All users in DB:');
        allUsers.forEach(u => console.log(`  ID: ${u.id} | User: ${u.username} | Company: ${u.company} | Email: ${u.vpEmail} | AutoReports: ${u.autoEmailReports}`));
        return;
    }

    console.log(`✅ Found user: ${user.username} (${user.company})`);
    console.log(`   Current vpEmail: ${user.vpEmail}`);
    console.log(`   Current autoEmailReports: ${user.autoEmailReports}`);

    // Update the user
    const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
            vpEmail: 'vasco@cozinhacriativa.pt',
            autoEmailReports: true,
        }
    });

    console.log('\n🎉 Updated successfully!');
    console.log(`   vpEmail: ${updated.vpEmail}`);
    console.log(`   autoEmailReports: ${updated.autoEmailReports}`);
    console.log('\n📧 Reports will be sent to:');
    console.log('   → vasco@cozinhacriativa.pt (client)');
    console.log('   → comercial@techscire.pt (internal review)');
    console.log('\n✅ Every Monday the report will be generated and emailed automatically!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
