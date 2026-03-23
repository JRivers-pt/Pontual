import { prisma } from '../src/lib/db';
import * as bcrypt from 'bcryptjs';

async function addGengibre() {
    const password = await bcrypt.hash('CC2026', 8);
    const user = await prisma.user.upsert({
        where: { username: 'Gengibre' },
        update: {
            username: 'Gengibre',
            password,
            company: 'Cozinha Criativa',
            name: 'Guilherme',
            apiKey: 'ca9605b9d17b330391a3f2e25ac6c5b1',
            apiSecret: '8a19bfac316a3c3c4cab75b7a0dd7d7f',
            apiUrl: 'https://api.eu.crosschexcloud.com/'
        },
        create: {
            username: 'Gengibre',
            password,
            company: 'Cozinha Criativa',
            name: 'Guilherme',
            role: 'CLIENT',
            apiKey: 'ca9605b9d17b330391a3f2e25ac6c5b1',
            apiSecret: '8a19bfac316a3c3c4cab75b7a0dd7d7f',
            apiUrl: 'https://api.eu.crosschexcloud.com/'
        }
    });
    console.log('Gengibre user updated:', user.id);
}

addGengibre().catch(console.error);
