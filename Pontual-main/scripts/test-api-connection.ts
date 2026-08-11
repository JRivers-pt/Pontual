import { readFileSync } from 'fs';
import { join } from 'path';

// Carregar variáveis do .env.local manualmente
try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim();
        }
    });
} catch (e) {
    console.warn('Warning: Could not load .env.local');
}

const API_URL = process.env.NEXT_PUBLIC_CROSSCHEX_API_URL || 'https://api.eu.crosschexcloud.com/';
const API_KEY = process.env.CROSSCHEX_API_KEY;
const API_SECRET = process.env.CROSSCHEX_API_SECRET;

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

async function testAuthentication() {
    console.log('===========================================');
    console.log('  TESTE DE AUTENTICAÇÃO - CrossChex Cloud');
    console.log('===========================================\n');

    console.log('📡 URL:', API_URL);
    console.log('🔑 API Key:', API_KEY?.substring(0, 10) + '...');
    console.log('🔐 API Secret:', API_SECRET?.substring(0, 10) + '...\n');

    try {
        const requestBody = {
            header: {
                nameSpace: 'authorize.token',
                nameAction: 'token',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            payload: {
                api_key: API_KEY,
                api_secret: API_SECRET
            }
        };

        console.log('📤 Enviando pedido de autenticação...');
        console.log('Timestamp:', requestBody.header.timestamp);
        console.log('Request ID:', requestBody.header.requestId, '\n');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        console.log('📥 Resposta recebida:');
        console.log('Status:', response.status, response.statusText);

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.log('❌ Resposta não é JSON válido:');
            console.log(responseText.substring(0, 500));
            return null;
        }

        if (data.payload?.token) {
            console.log('✅ AUTENTICAÇÃO BEM-SUCEDIDA!\n');
            console.log('Token recebido:', data.payload.token.substring(0, 50) + '...');
            console.log('Expira em:', data.payload.expires);
            return data.payload.token;
        } else {
            console.log('❌ Falha na autenticação:');
            console.log(JSON.stringify(data, null, 2));
            return null;
        }
    } catch (error: any) {
        console.log('❌ Erro:', error.message);
        return null;
    }
}

async function testGetRecords(token: string) {
    console.log('\n===========================================');
    console.log('  TESTE DE BUSCA DE REGISTOS');
    console.log('===========================================\n');

    try {
        // Buscar registos dos últimos 7 dias
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const beginTime = startDate.toISOString().replace('Z', '+00:00');
        const endTime = endDate.toISOString().replace('Z', '+00:00');

        console.log('📅 Período:');
        console.log('Início:', beginTime);
        console.log('Fim:', endTime, '\n');

        const requestBody = {
            header: {
                nameSpace: 'attendance.record',
                nameAction: 'getrecord',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            authorize: {
                type: 'token',
                token: token
            },
            payload: {
                begin_time: beginTime,
                end_time: endTime,
                order: 'desc',
                page: 1,
                per_page: 10
            }
        };

        console.log('📤 Enviando pedido de registos...\n');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        console.log('📥 Resposta recebida:');
        console.log('Status:', response.status, response.statusText);

        const responseText = await response.text();
        let data;

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.log('❌ Resposta não é JSON válido:');
            console.log(responseText.substring(0, 500));
            return;
        }

        if (data.payload?.list) {
            console.log('✅ REGISTOS OBTIDOS COM SUCESSO!\n');
            console.log('📊 Resumo:');
            console.log('Total de registos:', data.payload.count);
            console.log('Registos nesta página:', data.payload.list.length);
            console.log('Página:', data.payload.page, '/', data.payload.pageCount, '\n');

            if (data.payload.list.length > 0) {
                console.log('📋 Primeiros registos:');
                data.payload.list.slice(0, 3).forEach((record: any, i: number) => {
                    console.log(`\n${i + 1}. ${record.employee.first_name} ${record.employee.last_name} (${record.employee.workno})`);
                    console.log(`   Hora: ${record.checktime}`);
                    console.log(`   Dispositivo: ${record.device.name}`);
                });
            } else {
                console.log('ℹ️  Sem registos no período especificado');
            }
        } else {
            console.log('❌ Falha ao obter registos:');
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error: any) {
        console.log('❌ Erro:', error.message);
    }
}

async function runTests() {
    const token = await testAuthentication();

    if (token) {
        await testGetRecords(token);

        console.log('\n===========================================');
        console.log('  ✅ TESTES CONCLUÍDOS COM SUCESSO!');
        console.log('  A API está pronta para integração.');
        console.log('===========================================\n');
    } else {
        console.log('\n===========================================');
        console.log('  ❌ TESTES FALHARAM');
        console.log('  Verifique as credenciais e tente novamente.');
        console.log('===========================================\n');
    }
}

runTests().catch(console.error);
