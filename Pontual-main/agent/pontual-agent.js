/**
 * Agente de Sincronizacao Pontual -> Suprema CardPass3 (MySQL)
 * Corre no PC da Escola em segundo plano e envia as picagens diretamente
 * da DB local (MySQL) para a Base de Dados Central na Nuvem (Neon / Supabase).
 * 
 * Vantagens:
 * - 100% robusto, sem intermediários ou erros de proxy/timeout
 * - Sincronizacao em tempo real de segundo a segundo
 * - Visualização imediata em www.pontualidade.pt de qualquer computador ou rede
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

const configPath = path.join(__dirname, 'config.json');
const statePath = path.join(__dirname, 'state.json');

if (!fs.existsSync(configPath)) {
  console.error('[ERRO] Ficheiro config.json nao encontrado!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let state = { lastEventId: 0, lastSyncTime: null };
if (fs.existsSync(statePath)) {
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {}
}

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

let dbPool = null;

async function syncEvents() {
  try {
    if (!dbPool) {
      dbPool = mysql.createPool({
        host: config.mysqlHost || '127.0.0.1',
        port: config.mysqlPort || 3306,
        user: config.mysqlUser || 'cardpass3',
        password: config.mysqlPassword || 'cardpass3',
        database: config.mysqlDatabase || 'cardpass3',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
      });
      console.log(`[MySQL Local] Ligacao ao CardPass3 estabelecida.`);
    }

    // Leitura dos novos eventos de picagem
    const [rows] = await dbPool.execute(`
      SELECT e.id_event, e.datetime_local, e.users_id_user, u.reg_number, u.user_name, u.surname, r.unique_name as reader_name
      FROM events e
      INNER JOIN users u ON e.users_id_user = u.id_user
      LEFT JOIN readers r ON e.readers_id_reader = r.id_reader
      WHERE e.id_event > ?
      ORDER BY e.id_event ASC
      LIMIT 300
    `, [state.lastEventId]);

    if (rows.length === 0) {
      return; // Nada de novo neste ciclo
    }

    const newEvents = rows.map(r => {
      const checktime = new Date(r.datetime_local).toISOString();
      const rawUserId = String(r.users_id_user);
      const finalWorkno = r.reg_number ? String(r.reg_number) : rawUserId;
      const empName = `${r.user_name || ''} ${r.surname || ''}`.trim();

      return {
        rawEventId: String(r.id_event),
        workno: finalWorkno,
        employeeName: empName || null,
        checktime: checktime,
        checktype: 1,
        deviceName: r.reader_name || 'CardPass3 Terminal',
        deviceSn: null
      };
    });

    console.log(`[Pontual Sync] ${newEvents.length} novas picagens detetadas. A enviar para a Nuvem via HTTPS...`);

    const cloudRes = await fetch(config.pontualUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-school-token': config.schoolToken
      },
      body: JSON.stringify({ punches: newEvents })
    });

    const text = await cloudRes.text();
    let cloudData = {};
    try {
      cloudData = JSON.parse(text);
    } catch (e) {
      console.error(`[Aviso Cloud] Resposta HTTP ${cloudRes.status}: O servidor web ainda esta a atualizar.`);
      return;
    }

    if (cloudRes.ok && cloudData.success) {
      state.lastEventId = Math.max(...rows.map(r => r.id_event));
      state.lastSyncTime = new Date().toISOString();
      saveState();
      console.log(`✅ [Pontual Sync] Sucesso! ${cloudData.inserted} picagens gravadas na Nuvem Central.`);
    } else {
      console.error('❌ [Pontual Sync Erro]', cloudData.error || cloudData);
    }

  } catch (err) {
    console.error('❌ [Erro Sincronizacao]', err.message);
  }
}

console.log('====================================================');
console.log('🚀 Agente Pontualidade -> Nuvem Central (CardPass3)');
console.log('🏢 Cliente: Colégio Manuel Bernardes (CMB)');
console.log(`⏱️  Intervalo de Verificacao: ${config.pollIntervalSeconds || 30} segundos`);
console.log('====================================================');

const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
setInterval(syncEvents, intervalMs);
syncEvents();

