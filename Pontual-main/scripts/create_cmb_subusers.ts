import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Encontrar a conta CMB principal (parent)
  const parentUser = await prisma.user.findFirst({ where: { username: 'CMB' } });
  if (!parentUser) {
    console.error('Utilizador CMB nao encontrado!');
    return;
  }
  console.log(`Parent encontrado: ${parentUser.username} (${parentUser.id})`);

  const defaultPassword = 'CMB2026';
  const hashedPassword = await bcrypt.hash(defaultPassword, 8);

  const subUsers = [
    { username: 'CMB1', name: 'CMB - Login 1 (Direção)' },
    { username: 'CMB2', name: 'CMB - Login 2 (RH)' },
    { username: 'CMB3', name: 'CMB - Login 3 (Secretaria)' },
    { username: 'CMB4', name: 'CMB - Login 4 (Coordenação)' },
    { username: 'CMB5', name: 'CMB - Login 5 (Reserva)' },
  ];

  console.log('\n--- A criar sub-utilizadores CMB ---');
  for (const su of subUsers) {
    const existing = await prisma.user.findFirst({ where: { username: su.username } });
    if (existing) {
      console.log(`[SKIP] ${su.username} já existe.`);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        username: su.username,
        name: su.name,
        password: hashedPassword,
        role: 'CLIENT',
        parentUserId: parentUser.id,
        company: 'Colégio Maristas de Braga',
        biometricProvider: 'SUPREMA',
      }
    });
    console.log(`[OK] Criado: ${created.username} (id: ${created.id})`);
  }

  console.log('\n========================================');
  console.log('LOGINS PARA ENTREGAR À ESCOLA (CMB):');
  console.log('========================================');
  console.log('  Username | Password');
  console.log('  ---------|----------');
  console.log(`  CMB      | CMB2026   (conta principal)`);
  console.log(`  CMB1     | CMB2026`);
  console.log(`  CMB2     | CMB2026`);
  console.log(`  CMB3     | CMB2026`);
  console.log(`  CMB4     | CMB2026`);
  console.log(`  CMB5     | CMB2026`);
  console.log('========================================');
  console.log('URL: https://www.pontualidade.pt');
  console.log('========================================');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
