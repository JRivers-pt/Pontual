import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const token = 'pontual_sync_cmb_9f8b4d2a_2026';
  await prisma.user.update({
    where: { username: 'CMB' },
    data: { syncToken: token, biometricProvider: 'SUPREMA' }
  });
  console.log(`Successfully updated CMB with syncToken: ${token}`);
}

main().finally(() => prisma.$disconnect());
