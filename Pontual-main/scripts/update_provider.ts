import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: {
      username: {
        equals: 'CMB',
        mode: 'insensitive'
      }
    },
    data: {
      biometricProvider: 'SUPREMA'
    }
  });
  console.log('Updated user biometricProvider:', result);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
