/**
 * Agente de Sincronizacao Pontual -> Suprema CardPass3 (MySQL)
 * Corre no PC da Escola em segundo plano e envia as picagens diretamente da DB local (MySQL) para www.pontualidade.pt
 * Vantagem: 100% independente, super rápido, nao sobrecarrega a API do BioStar.
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
      console.log(`[MySQL] Ligacao ao CardPass3 (Localhost) estabelecida.`);
    }

    // A tabela no CardPass3 que regista as picagens é a 'events'.
    // Eventos de picagem tipicamente tem event_type_id = 4096 ou semelhante (Access Granted / Punch).
    // Para nao perder dados, lemos da tabela events cruzando com a tabela users.
    const [rows] = await dbPool.execute(`
      SELECT e.id_event, e.datetime_local, e.users_id_user, u.reg_number, u.user_name, u.surname, r.unique_name as reader_name
      FROM events e
      INNER JOIN users u ON e.users_id_user = u.id_user
      LEFT JOIN readers r ON e.readers_id_reader = r.id_reader
      WHERE e.id_event > ?
      ORDER BY e.id_event ASC
      LIMIT 200
    `, [state.lastEventId]);

    if (rows.length === 0) return; // Nenhum evento novo

    const newEvents = rows.map(r => {
      // Formata a data (evitando problemas de timezone, forçamos o ISO 8601 da BD local)
      const checktime = new Date(r.datetime_local).toISOString();
      const rawUserId = String(r.users_id_user);
      const finalWorkno = r.reg_number ? String(r.reg_number) : rawUserId;
      const empName = `${r.user_name || ''} ${r.surname || ''}`.trim();

      return {
        rawEventId: String(r.id_event),
        workno: finalWorkno,
        employeeName: empName || null,
        checktime: checktime,
        checktype: 1, // Por defeito assumimos IN/OUT alternado ou que a nuvem resolve
        deviceName: r.reader_name || 'CardPass3 Terminal',
        deviceSn: null
      };
    });

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
      state.lastEventId = Math.max(...rows.map(r => r.id_event));
      state.lastSyncTime = new Date().toISOString();
      saveState();
      console.log(`[Pontual Sync] Sincronizacao concluida com sucesso! (${cloudData.inserted} inseridas / ignorados duplicados)`);
    } else {
      console.error('[Pontual Sync Erro Cloud]', cloudData.error || cloudData);
    }
  } catch (err) {
    console.error('[Erro de Ciclo de Sincronizacao]', err.message);
  }
}

console.log('====================================================');
console.log('🚀 Agente Pontualidade -> MySQL (CardPass3) Ativo');
console.log(`📡 Destino: ${config.pontualUrl}`);
console.log(`⏱️ Intervalo: ${config.pollIntervalSeconds || 30} segundos`);
console.log('====================================================');

const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
setInterval(syncEvents, intervalMs);
syncEvents();
