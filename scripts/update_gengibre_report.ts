import { prisma } from '../src/lib/db';

async function main() {
    console.log('--- Atualizando Configurações de Relatório: Gengibre ---');
    try {
        const user = await prisma.user.update({
            where: { username: 'Gengibre' },
            data: {
                vpEmail: 'gengibre@cozinhacriativa.pt',
                autoEmailReports: true,
                reportHeader: 'Pontual | Cozinha Criativa (Gengibre)'
            }
        });
        console.log(`✅ Sucesso! Relatórios ativos para: ${user.vpEmail}`);
    } catch (e) {
        console.error('❌ Erro ao atualizar utilizador Gengibre. Verifique se o username existe.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
