import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
    console.log('--- Testando Resend ---');
    console.log('API Key:', process.env.RESEND_API_KEY?.substring(0, 7) + '...');
    
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'comercial@techscire.pt',
            subject: 'Teste de Configuração Pontual',
            html: '<h1>Sucesso!</h1><p>A configuração do Resend está a funcionar corretamente.</p>'
        });
        
        if (error) {
            console.error('❌ Erro do Resend:', error);
        } else {
            console.log('✅ Email enviado com sucesso! ID:', data?.id);
            console.log('Verifique a sua caixa de entrada (comercial@techscire.pt).');
        }
    } catch (e) {
        console.error('❌ Falha crítica:', e);
    }
}

test();
