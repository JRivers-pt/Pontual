import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function createVP() {
    const password = await bcrypt.hash('vila123', 8);
    const user = await prisma.user.upsert({
        where: { username: 'vila_peixoto' },
        update: {
            company: 'Vila Peixoto',
            email: 'geral@vilapeixoto.pt', // Placeholder
            name: 'Paulo Peixoto',
            apiKey: 'e1333efb083e4f994aaea2cf3f86f1c0', // Same as admin for testing
            apiSecret: '1109f672c35321500de3bb33a8d93af2'
        },
        create: {
            username: 'vila_peixoto',
            password,
            company: 'Vila Peixoto',
            email: 'geral@vilapeixoto.pt',
            name: 'Paulo Peixoto',
            role: 'CLIENT',
            apiKey: 'e1333efb083e4f994aaea2cf3f86f1c0',
            apiSecret: '1109f672c35321500de3bb33a8d93af2'
        }
    });
    console.log('Created Vila Peixoto user:', user);
}
createVP();
