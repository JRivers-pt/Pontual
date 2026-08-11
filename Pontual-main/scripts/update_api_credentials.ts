import { PrismaClient } from '@prisma/client'

// Use production database
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_whD1KTVJ8raL@ep-purple-fire-ab7k5vl2-pooler.eu-west-2.aws.neon.tech/neondb?connect_timeout=15&sslmode=require"
        }
    }
})

async function main() {
    console.log('🔄 A atualizar credenciais da API CrossChex para o utilizador VE...')

    const user = await prisma.user.update({
        where: { username: 'VE' },
        data: {
            apiKey: 'e1333efb083e4f994aaea2cf3f86f1c0',
            apiSecret: '1109f672c35321500de3bb33a8d93af2',
            apiUrl: 'https://api.eu.crosschexcloud.com/',
        },
    })

    console.log(`✅ Credenciais da API atualizadas com sucesso!`)
    console.log(`   Username: ${user.username}`)
    console.log(`   API Key: ${user.apiKey?.substring(0, 8)}...`)
    console.log(`   API URL: ${user.apiUrl}`)
}

main()
    .catch((e) => {
        console.error('❌ Erro:', e.message)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
