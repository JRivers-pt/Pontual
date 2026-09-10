import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = 'CMB';
  const password = 'CMB2026';

  console.log(`Buscando usuário: ${username}`);
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (!user) {
    console.log('Usuário não encontrado!');
    return;
  }

  console.log(`Usuário encontrado: ID = ${user.id}`);
  
  if (!user.password) {
      console.log('Usuário não tem senha definida!');
      return;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  console.log(`Senha correta? ${isMatch}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
