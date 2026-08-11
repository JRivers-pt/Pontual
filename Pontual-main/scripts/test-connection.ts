import { getEmployees, getAttendanceRecords, getAuthToken } from '../src/lib/api';
import fs from 'fs';
import path from 'path';

// Carregar variáveis de ambiente manualmente pa testar fora do Next.js
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split(/\r?\n/).forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) {
            process.env[key.trim()] = val.trim();
        }
    });
}

// Lista de Endpoints para testar
const CANDIDATE_URLS = [
    "https://api.eu.crosschexcloud.com" // Confirmado pelo screenshot anterior
];

function getFormattedDate() {
    // Format: YYYY-MM-DD HH:mm:ss
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

async function runTest() {
    console.log("--- Iniciando Teste (TIMESTAMP FIX) ---");

    // Tentar encontrar um URL funcional
    let validUrl = "";
    let validToken = "";

    for (const url of CANDIDATE_URLS) {
        console.log(`\n🔎 Testando URL: ${url}...`);
        try {
            const timestamp = getFormattedDate();
            console.log("Timestamp enviado:", timestamp);

            const requestBody = {
                header: {
                    nameSpace: 'authorize.token',
                    nameAction: 'token',
                    version: '1.0',
                    requestId: 'test-' + Date.now(),
                    timestamp: timestamp
                },
                payload: {
                    api_key: process.env.CROSSCHEX_API_KEY,
                    api_secret: process.env.CROSSCHEX_API_SECRET
                }
            };

            const res = await fetch(`${url}/`, { // POST para RAIZ
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (res.ok) {
                const data = await res.json();
                if (data.payload?.result?.token) {
                    console.log("✅ SUCESSO! Token recebido.");
                    validUrl = url;
                    validToken = data.payload.result.token;
                    break;
                } else {
                    console.log("⚠️ Resposta:", JSON.stringify(data));
                }
            } else {
                console.log(`❌ Falha HTTP (${res.status}):`, (await res.text()).substring(0, 100));
            }
        } catch (e: any) {
            console.log(`❌ Erro: ${e.message}`);
        }
    }

    if (!validUrl) {
        return;
    }

    // Se encontrou, continua o teste com o URL válido
    console.log("\n--- A testar 'Get Employees' usando o URL válido ---");
    console.log(`Using URL: ${validUrl}`);
    process.env.NEXT_PUBLIC_CROSSCHEX_API_URL = validUrl;

    try {
        const empBody = {
            header: {
                nameSpace: 'person.person',
                nameAction: 'get',
                version: '1.0',
                requestId: 'test-emp-' + Date.now(),
                timestamp: new Date().toISOString()
            },
            authorize: {
                token: validToken
            },
            payload: {
                limit: 5,
                offset: 0
            }
        };

        const resEmpl = await fetch(`${validUrl}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(empBody)
        });
        console.log("Employees Response:", await resEmpl.text());
    } catch (e) { console.error(e); }

}

runTest();
