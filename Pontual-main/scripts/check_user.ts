import { prisma } from '../src/lib/db';
async function check() {
    const user = await prisma.user.findFirst({
        where: { company: { contains: 'Vila Peixoto' } }
    });
    console.log(JSON.stringify(user, null, 2));
}
check();
