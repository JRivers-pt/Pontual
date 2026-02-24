import { prisma } from '../src/lib/db';
async function list() {
    const users = await prisma.user.findMany();
    console.log(JSON.stringify(users, null, 2));
}
list();
