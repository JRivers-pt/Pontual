/**
 * Agente de Sincronizacao Pontual -> Suprema BioStar 2
 * Corre no PC da Escola em segundo plano e envia as picagens dos BioEntry W2 para www.pontualidade.pt
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Ignorar certificado SSL local auto-assinado do BioStar 2
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const configPath = path.join(__dirname, 'config.json');
const statePath = path.join(__dirname, 'state.json');
const mappingPath = path.join(__dirname, 'mapping.json');

if (!fs.existsSync(configPath)) {
  console.error('[ERRO] Ficheiro config.json nao encontrado!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Carregar mapeamento de IDs se existir (ex: Suprema "1" -> Pontual "600")
let idMapping = {};
if (fs.existsSync(mappingPath)) {
  try {
    idMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    console.log(`[Mapeamento] Carregadas ${Object.keys(idMapping).length} correspondencias de IDs.`);
  } catch (e) {
    console.error('[Aviso] Erro ao ler mapping.json:', e.message);
  }
}

let state = { lastEventId: 0, lastSyncTime: null };
if (fs.existsSync(statePath)) {
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {}
}

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

let sessionToken = null;

async function loginBioStar() {
  try {
    const res = await fetch(`${config.biostarUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: config.biostarUser,
        password: config.biostarPassword
      }),
      agent: httpsAgent
    });

    if (!res.ok) {
      throw new Error(`Falha no login BioStar: ${res.statusText}`);
    }

    sessionToken = res.headers.get('bs-session-id');
    console.log('[BioStar 2] Sessao iniciada com sucesso.');
    return sessionToken;
  } catch (err) {
    console.error('[BioStar 2 Login]', err.message);
    sessionToken = null;
    return null;
  }
}

async function syncEvents() {
  try {
    if (!sessionToken) {
      await loginBioStar();
      if (!sessionToken) return;
    }

    // 1. Obter eventos recentes do BioStar 2
    const res = await fetch(`${config.biostarUrl}/api/events?limit=100&order_by=id:desc`, {
      headers: { 'bs-session-id': sessionToken },
      agent: httpsAgent
    });

    if (res.status === 401) {
      sessionToken = null; // Sessao expirada
      return;
    }

    const data = await res.json();
    const rows = data.EventCollection?.rows || data.records || [];

    if (rows.length === 0) return;

    // Filtrar eventos e aplicar o mapeamento de IDs
    const newEvents = rows
      .filter(e => e.id > state.lastEventId)
      .map(e => {
        const rawUserId = e.user_id ? String(e.user_id.user_id || e.user_id) : 'UNKNOWN';
        const finalWorkno = idMapping[rawUserId] || rawUserId; // Mapeia para o ID do Pontual (ex: 600) se existir

        return {
          rawEventId: String(e.id),
          workno: String(finalWorkno),
          employeeName: e.user_id?.name || null,
          checktime: e.datetime || new Date().toISOString(),
          checktype: e.event_type_id?.code === 4096 ? 1 : 1,
          deviceName: e.device_id?.name || 'BioEntry W2',
          deviceSn: e.device_id?.id ? String(e.device_id.id) : null
        };
      });

    if (newEvents.length > 0) {
      console.log(`[Pontual Sync] A enviar ${newEvents.length} novas picagens para o Pontualidade.pt...`);

      const cloudRes = await fetch(config.pontualUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-school-token': config.schoolToken
        },
        body: JSON.stringify({ punches: newEvents })
      });

      const cloudData = await cloudRes.json();

      if (cloudRes.ok && cloudData.success) {
        state.lastEventId = Math.max(...rows.map(r => r.id));
        state.lastSyncTime = new Date().toISOString();
        saveState();
        console.log(`[Pontual Sync] Sincronizacao concluida com sucesso! (${cloudData.inserted} novas inseridas)`);
      } else {
        console.error('[Pontual Sync Erro Cloud]', cloudData.error || cloudData);
      }
    }
  } catch (err) {
    console.error('[Erro de Ciclo de Sincronizacao]', err.message);
  }
}

console.log('====================================================');
console.log('🚀 Agente Pontualidade -> BioStar 2 Ativo');
console.log(`📡 Destino: ${config.pontualUrl}`);
console.log(`⏱️ Intervalo: ${config.pollIntervalSeconds || 30} segundos`);
console.log('====================================================');

const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
setInterval(syncEvents, intervalMs);
syncEvents();
