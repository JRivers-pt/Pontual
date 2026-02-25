import { prisma } from '../src/lib/db';
import * as bcrypt from 'bcryptjs';

async function addGengibre() {
    const password = await bcrypt.hash('gengibre123', 8);
    const user = await prisma.user.upsert({
        where: { username: 'gengibre' },
        update: {
            company: 'Cozinha Criativa',
            name: 'Guilherme',
            apiKey: 'e1333efb083e4f994aaea2cf3f86f1c0', // As seen in screenshots
            apiSecret: '1109f672c35321500de3bb33a8d93af2', // Assuming same as other clients for now if not provided
            apiUrl: 'https://api.eu.crosschexcloud.com/'
        },
        create: {
            username: 'gengibre',
            password,
            company: 'Cozinha Criativa',
            name: 'Guilherme',
            role: 'CLIENT',
            apiKey: 'e1333efb083e4f994aaea2cf3f86f1c0',
            apiSecret: '1109f672c35321500de3bb33a8d93af2',
            apiUrl: 'https://api.eu.crosschexcloud.com/'
        }
    });
    console.log('Gengibre user added:', user.id);
}

addGengibre().catch(console.error);
