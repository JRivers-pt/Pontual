/**
 * Import CMB employees from colaboradores_cmb.json into the Employee table.
 * Run once: npx tsx scripts/import_employees_cmb.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function fixEncoding(str: string): string {
  if (!str) return str;
  return str
    .replace(/A\u0015A\u0083/g, 'ç').replace(/A\u0015A/g, 'ç')
    .replace(/A\u0015a/g, 'ã').replace(/A\u0015o/g, 'õ')
    .replace(/AÃ\u00a7/g, 'ç').replace(/Ã\u00a3/g, 'ã')
    .replace(/Ã\u00b5/g, 'õ').replace(/Ã\u00a9/g, 'é')
    .replace(/Ã\u00a0/g, 'à').replace(/Ã\u00ba/g, 'ú')
    .replace(/Ã\u00b3/g, 'ó').replace(/Ã\u00aa/g, 'ê')
    .replace(/Ã\u00ad/g, 'í').replace(/Ã\u00b4/g, 'ô')
    .replace(/Ac/g, 'é').replace(/A3/g, 'ó')
    .replace(/A-/g, 'í').replace(/A7/g, 'ç')
    .replace(/A\u0015/g, 'ç');
}

async function main() {
  const jsonPath = path.join(__dirname, '..', '..', '..', 'Desktop', 'cmb', 'colaboradores_cmb.json');
  const altPath = 'C:/Users/JD/Desktop/cmb/colaboradores_cmb.json';
  
  const filePath = fs.existsSync(jsonPath) ? jsonPath : altPath;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const employees = data.Employees || data.employees || data;

  // Find CMB client user
  const user = await prisma.user.findFirst({
    where: { syncToken: 'pontual_sync_cmb_9f8b4d2a_2026' }
  });

  if (!user) {
    console.error('CMB user not found! Check syncToken.');
    process.exit(1);
  }

  console.log(`Found CMB user: ${user.name} (${user.id})`);
  console.log(`Importing ${employees.length} employees...`);

  let created = 0;
  let skipped = 0;

  for (const emp of employees) {
    const workno = String(emp.reg_number || emp.id_user || '').padStart(4, '0');
    const name = (emp.name || `${emp.user_name || ''} ${emp.surname || ''}`).trim();
    
    if (!workno || workno === '0000' || !name) {
      skipped++;
      continue;
    }

    try {
      await prisma.employee.upsert({
        where: { userId_workno: { userId: user.id, workno } },
        update: {
          name,
          cardNumber: emp.card_number || null,
          active: emp.active === 'Ativo' || emp.active === true || emp.active === 1,
          scheduleCode: emp.schedule_code || null,
          scheduleName: emp.schedule_name || null,
        },
        create: {
          userId: user.id,
          workno,
          name,
          cardNumber: emp.card_number || null,
          active: emp.active === 'Ativo' || emp.active === true || emp.active === 1,
          scheduleCode: emp.schedule_code || null,
          scheduleName: emp.schedule_name || null,
        }
      });
      created++;
      console.log(`  ✅ ${workno} — ${name}`);
    } catch (e: any) {
      console.error(`  ❌ ${workno} — ${name}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone! Created/updated: ${created} | Skipped: ${skipped}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
