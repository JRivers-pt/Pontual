import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient()

async function main() {
    const email = process.env.ADMIN_EMAIL || 'admin@pontual.com'
    const password = process.env.ADMIN_PASSWORD || 'admin123'
    const apiKey = process.env.CROSSCHEX_API_KEY
    const apiSecret = process.env.CROSSCHEX_API_SECRET

    if (!apiKey || !apiSecret) {
        console.error('❌ CROSSCHEX_API_KEY or CROSSCHEX_API_SECRET missing in .env.local')
        return
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            apiKey,
            apiSecret,
        },
        create: {
            email,
            name: 'VE Vontade e Empenho',
            password: hashedPassword,
            apiKey,
            apiSecret,
        },
    })

    console.log(`✅ Utilizador criado/atualizado: ${user.email}`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
