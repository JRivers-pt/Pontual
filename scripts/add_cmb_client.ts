import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Use production database
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_pRg4UkDoItN0@ep-divine-queen-abc5fzem-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15"
        }
    }
})

async function main() {
    console.log('\n🔄 A criar/atualizar o cliente CMB (Colégio Manuel Bernardes)...')

    const hashedPassword = await bcrypt.hash('CMB2026/27', 8)

    const user = await prisma.user.upsert({
        where: { username: 'CMB' },
        update: {
            password: hashedPassword,
            name: 'CMB',
            company: 'Colégio Manuel Bernardes',
            role: 'CLIENT',
        },
        create: {
            username: 'CMB',
            password: hashedPassword,
            name: 'CMB',
            company: 'Colégio Manuel Bernardes',
            role: 'CLIENT',
            apiUrl: 'https://api.eu.crosschexcloud.com/',
        },
    })

    console.log(`\n✅ Cliente criado/atualizado com sucesso!`)
    console.log(`   ID: ${user.id}`)
    console.log(`   Username: ${user.username}`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Company: ${user.company}`)
    console.log(`   Role: ${user.role}`)
    console.log(`   API Key: ${user.apiKey || 'N/A (ainda não configurada)'}`)
    console.log(`   API URL: ${user.apiUrl}\n`)
}

main()
    .catch((e) => {
        console.error('\n❌ Erro ao criar cliente:', e.message)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
