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
    console.log('🔄 A otimizar hash da password (de 10 para 8 rounds)...')

    // Use 8 rounds instead of 10 for faster verification
    const hashedPassword = await bcrypt.hash('VE2026', 8)

    const user = await prisma.user.update({
        where: { username: 'VE' },
        data: {
            password: hashedPassword,
        },
    })

    console.log(`✅ Password atualizada com hash otimizado!`)
    console.log(`   Username: ${user.username}`)
    console.log(`   Bcrypt rounds: 8 (era 10)`)
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e.message)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
