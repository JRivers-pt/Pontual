import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
    const adminUsername = 'admin'
    const adminPassword = 'JDmr1986@'
    const adminEmail = 'admin@pontualidade.pt'

    console.log('🔄 Setting up independent accounts...')

    // 1. Create or Update the dedicated Admin account
    const hashedPassword = await bcrypt.hash(adminPassword, 8)
    const admin = await prisma.user.upsert({
        where: { username: adminUsername },
        update: {
            role: 'ADMIN',
            password: hashedPassword,
        },
        create: {
            username: adminUsername,
            email: adminEmail,
            name: 'Administrador Pontual',
            password: hashedPassword,
            role: 'ADMIN',
        },
    })
    console.log(`✅ Admin account ready: ${admin.username}`)

    // 2. Downgrade VE account to CLIENT if it exists
    const veUser = await prisma.user.findUnique({
        where: { username: 'VE' }
    })

    if (veUser) {
        await prisma.user.update({
            where: { username: 'VE' },
            data: { role: 'CLIENT' }
        })
        console.log(`✅ Account 'VE' role updated to CLIENT.`)
    } else {
        console.log(`ℹ️ Account 'VE' not found, no role change needed.`)
    }

    console.log('\n--- Credentials ---')
    console.log(`Admin User: ${adminUsername}`)
    console.log(`Admin Pass: ${adminPassword}`)
    console.log('-------------------\n')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
