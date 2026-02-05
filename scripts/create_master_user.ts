import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Use production database
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_whD1KTVJ8raL@ep-purple-fire-ab7k5vl2-pooler.eu-west-2.aws.neon.tech/neondb?connect_timeout=15&sslmode=require"
        }
    }
})

async function main() {
    const username = 'VE'
    const password = 'VE2026'
    const email = 'admin@pontualidade.pt'

    console.log('🔄 A criar utilizador VE na base de dados Neon...')

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.upsert({
        where: { username },
        update: {
            password: hashedPassword,
            email
        },
        create: {
            username,
            email,
            name: 'VE Vontade e Empenho',
            password: hashedPassword,
            role: 'ADMIN',
        },
    })

    console.log(`✅ Utilizador criado com sucesso!`)
    console.log(`   Username: ${user.username}`)
    console.log(`   Password: VE2026`)
    console.log(`   Role: ${user.role}`)
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e.message)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
