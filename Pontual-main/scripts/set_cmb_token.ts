import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('CMB2026', 8);
  const updated = await prisma.user.update({
    where: { username: 'CMB' },
    data: { password: hash }
  });
  console.log(`Password reset for user: ${updated.username}`);
  const usersToReset = ['CMB', 'CMB1', 'CMB2', 'CMB3', 'CMB4', 'CMB5'];
  for (const u of usersToReset) {
    await prisma.user.updateMany({
      where: { username: { equals: u, mode: 'insensitive' } },
      data: { password: hash }
    });
    console.log(`Password reset for user: ${u}`);
  }
}

main().finally(() => prisma.$disconnect());


