import pg from 'pg';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';

const DATABASE_URL = 'postgresql://neondb_owner:npg_pRg4UkDoItN0@ep-divine-queen-abc5fzem-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15';
const EXCEL_PATH = 'C:\\Users\\JD\\Desktop\\Horários Colégio Manuel Bernardes.xlsx';

interface ExcelRow {
  Código: number;
  Nome: string;
  Apelido: string;
  'Manhã': string;
  'Tarde': string;
  Horário: string;
}

interface HorarioRow {
  Horarios: string;
  Entrada: number;
  'Saída\r\nAlmoço': number;
  'Regresso Almoço': number;
  Saída: number;
}

function excelTimeToHHMM(serial: number): string {
  const totalMinutes = Math.round(serial * 24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function parseTimeRange(range: string): { start: string; end: string } | null {
  if (!range || typeof range !== 'string') return null;
  const match = range.match(/(\d{1,2})[.\:](\d{2})\s*às\s*(\d{1,2})[.\:](\d{2})/);
  if (!match) return null;
  const [, sh, sm, eh, em] = match;
  return {
    start: `${sh.padStart(2, '0')}:${sm}`,
    end: `${eh.padStart(2, '0')}:${em}`,
  };
}

async function main() {
  console.log('=== SEED CMB - Colégio Manuel Bernardes ===\n');

  // 1. Read Excel
  console.log('📖 A ler o Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);

  const colabSheet = wb.Sheets['Colaboradores'];
  const horarioSheet = wb.Sheets['Horários'];

  if (!colabSheet || !horarioSheet) {
    console.error('❌ Folhas "Colaboradores" ou "Horários" não encontradas no Excel');
    process.exit(1);
  }

  const colaboradores = XLSX.utils.sheet_to_json<ExcelRow>(colabSheet);
  const horarios = XLSX.utils.sheet_to_json<HorarioRow>(horarioSheet);

  console.log(`   ${colaboradores.length} colaboradores encontrados`);
  console.log(`   ${horarios.length} horários encontrados\n`);

  // 2. Build schedule map from "Horários" sheet
  const scheduleMap = new Map<string, { startTime: string; endTime: string; name: string }>();

  for (const h of horarios) {
    const id = String(h.Horarios).trim();
    const startTime = excelTimeToHHMM(h.Entrada);
    const endTime = excelTimeToHHMM(h.Saída);
    scheduleMap.set(id, {
      startTime,
      endTime,
      name: `Turno ${id} (${startTime}-${endTime})`,
    });
    console.log(`   📋 ${id}: ${startTime} - ${endTime}`);
  }
  console.log('');

  // 3. Connect to PostgreSQL
  console.log('🔌 A ligar à base de dados...');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('   ✅ Ligado\n');

  try {
    // 4. Create CMB user
    console.log('👤 A criar utilizador CMB...');
    const hashedPassword = await bcrypt.hash('CMB@2026', 10);

    const existingUser = await client.query(
      'SELECT id FROM "User" WHERE username = $1',
      ['CMB']
    );

    let userId: string;

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      console.log(`   ℹ️  Utilizador CMB já existe (id: ${userId})\n`);
    } else {
      const cuid = 'cmb_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
      const insertResult = await client.query(
        `INSERT INTO "User" (
          id, username, password, email, name, company, role,
          "apiKey", "apiSecret", "apiUrl",
          "reportHeader", "autoEmailReports",
          "overtimeTolerance", "subtractTolerance",
          "mealBreakMinutes", "mealBreakThresholdHours",
          "overtimeCapHours",
          "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12,
          $13, $14,
          $15, $16,
          $17,
          NOW(), NOW()
        ) RETURNING id`,
        [
          cuid,
          'CMB',
          hashedPassword,
          null,
          null,
          'Colégio Manuel Bernardes',
          'CLIENT',
          'c430904458f0033af3b2b4d49a3173ba',
          '450044be61aa42aa6551a594b6d003f5',
          'https://api.eu.crosschexcloud.com/',
          'Colégio Manuel Bernardes | Relatório de Assiduidade',
          false,
          20,
          false,
          60,
          6,
          8,
        ]
      );
      userId = insertResult.rows[0].id;
      console.log(`   ✅ Utilizador CMB criado (id: ${userId})\n`);
    }

    // 5. Create schedules
    console.log('📅 A criar 30 horários...');
    const scheduleIdMap = new Map<string, string>(); // H1 -> db id

    for (const [horarioId, schedule] of scheduleMap) {
      // Check if schedule already exists for this user
      const existing = await client.query(
        'SELECT id FROM "Schedule" WHERE "userId" = $1 AND name = $2',
        [userId, schedule.name]
      );

      if (existing.rows.length > 0) {
        scheduleIdMap.set(horarioId, existing.rows[0].id);
        console.log(`   ℹ️  ${schedule.name} já existe`);
        continue;
      }

      const schedCuid = 'sch_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
      const result = await client.query(
        `INSERT INTO "Schedule" (id, name, "startTime", "endTime", "lateTolerance", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [schedCuid, schedule.name, schedule.startTime, schedule.endTime, 20, userId]
      );
      scheduleIdMap.set(horarioId, result.rows[0].id);
      console.log(`   ✅ ${schedule.name}`);
    }
    console.log('');

    // 6. Assign employees to schedules
    console.log('👥 A atribuir 70 colaboradores aos horários...');
    let assigned = 0;
    let skipped = 0;
    let errors = 0;

    for (const colab of colaboradores) {
      const workno = String(colab.Código);
      const horarioId = String(colab.Horário).trim();
      const scheduleDbId = scheduleIdMap.get(horarioId);

      if (!scheduleDbId) {
        console.error(`   ❌ Horário ${horarioId} não encontrado para workno ${workno}`);
        errors++;
        continue;
      }

      try {
        // Use upsert - check if assignment exists first
        const existing = await client.query(
          'SELECT id FROM "EmployeeSchedule" WHERE workno = $1 AND "scheduleId" = $2',
          [workno, scheduleDbId]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        const empCuid = 'emp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
        await client.query(
          `INSERT INTO "EmployeeSchedule" (id, workno, "scheduleId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT ("workno", "scheduleId") DO NOTHING`,
          [empCuid, workno, scheduleDbId]
        );
        assigned++;
      } catch (err: any) {
        console.error(`   ❌ Erro ao atribuir workno ${workno}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n   ✅ ${assigned} colaboradores atribuídos`);
    if (skipped > 0) console.log(`   ℹ️  ${skipped} já existiam`);
    if (errors > 0) console.log(`   ❌ ${errors} erros`);

    // 7. Summary
    console.log('\n=== RESUMO ===');
    console.log(`Utilizador: CMB (Colégio Manuel Bernardes)`);
    console.log(`Password: CMB@2026`);
    console.log(`Horários criados: ${scheduleIdMap.size}`);
    console.log(`Colaboradores atribuídos: ${assigned}`);
    console.log(`Tolerância atrasos: 20 minutos`);
    console.log(`API Key: c430904458f0033af3b2b4d49a3173ba`);
    console.log('\n✅ Seed concluído com sucesso!');

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
