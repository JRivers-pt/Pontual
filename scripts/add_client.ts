import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config() // Fallback to .env

async function main() {
    const args = process.argv.slice(2)
    const params: Record<string, string> = {}

    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].replace('--', '')
            params[key] = args[i + 1]
            i++
        }
    }

    const {
        username,
        password,
        email,
        name,
        company,
        apiKey,
        apiSecret,
        apiUrl,
        role
    } = params

    if (!username || !password) {
        console.log('\n❌ Missing required parameters!')
        console.log('\nUsage:')
        console.log('npx tsx scripts/add_client.ts \\')
        console.log('  --username <user> \\')
        console.log('  --password <pass> \\')
        console.log('  --email <email> \\')
        console.log('  --name "<Display Name>" \\')
        console.log('  --company "<Company Name>" \\')
        console.log('  --role [ADMIN|CLIENT] \\')
        console.log('  --apiKey <crosschex_key> \\')
        console.log('  --apiSecret <crosschex_secret> \\')
        console.log('  --apiUrl <crosschex_url>\n')
        process.exit(1)
    }

    const prisma = new PrismaClient()

    try {
        console.log(`\n🔄 Processing user: ${username}...`)

        // Use 8 rounds for faster login performance
        const hashedPassword = await bcrypt.hash(password, 8)

        const user = await prisma.user.upsert({
            where: { username },
            update: {
                password: hashedPassword,
                email: email || undefined,
                name: name || undefined,
                company: company || undefined,
                apiKey: apiKey || undefined,
                apiSecret: apiSecret || undefined,
                apiUrl: apiUrl || undefined,
                role: (role as any) || undefined
            },
            create: {
                username,
                password: hashedPassword,
                email: email || null,
                name: name || null,
                company: company || null,
                apiKey: apiKey || null,
                apiSecret: apiSecret || null,
                apiUrl: apiUrl || "https://api.eu.crosschexcloud.com/",
                role: (role as any) || 'CLIENT'
            }
        })

        console.log(`\n✅ User ${user.username} created/updated successfully!`)
        console.log(`   ID: ${user.id}`)
        console.log(`   Role: ${user.role}`)
        console.log(`   Name: ${user.name || 'N/A'}`)
        console.log(`   Company: ${user.company || 'N/A'}\n`)
    } catch (error) {
        console.error('\n❌ Error creating user:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
