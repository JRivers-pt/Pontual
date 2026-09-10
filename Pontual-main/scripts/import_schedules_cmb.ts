import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

// Exact schedule definitions parsed from CMB.txt
const SCHEDULE_DEFINITIONS: Record<string, { startTime: string; endTime: string; lunchDuration: number; name: string }> = {
  H1:  { startTime: '07:00', endTime: '16:00', lunchDuration: 60,  name: 'H1 - 07:00 às 16:00 (Almoço 1h)' },
  H3:  { startTime: '07:30', endTime: '16:30', lunchDuration: 60,  name: 'H3 - 07:30 às 16:30 (Almoço 1h)' },
  H4:  { startTime: '07:30', endTime: '16:30', lunchDuration: 60,  name: 'H4 - 07:30 às 16:30 (Almoço 1h)' },
  H5:  { startTime: '07:30', endTime: '16:30', lunchDuration: 60,  name: 'H5 - 07:30 às 16:30 (Almoço 1h)' },
  H6:  { startTime: '07:30', endTime: '17:00', lunchDuration: 90,  name: 'H6 - 07:30 às 17:00 (Almoço 1h30)' },
  H7:  { startTime: '08:00', endTime: '17:00', lunchDuration: 60,  name: 'H7 - 08:00 às 17:00 (Almoço 1h)' },
  H8:  { startTime: '08:00', endTime: '18:00', lunchDuration: 120, name: 'H8 - 08:00 às 18:00 (Almoço 2h)' },
  H9:  { startTime: '08:00', endTime: '17:00', lunchDuration: 60,  name: 'H9 - 08:00 às 17:00 (Almoço 1h)' },
  H10: { startTime: '08:00', endTime: '16:35', lunchDuration: 60,  name: 'H10 - 08:00 às 16:35 (Almoço 1h)' },
  H11: { startTime: '08:00', endTime: '17:00', lunchDuration: 60,  name: 'H11 - 08:00 às 17:00 (Almoço 1h)' },
  H12: { startTime: '08:00', endTime: '17:30', lunchDuration: 90,  name: 'H12 - 08:00 às 17:30 (Almoço 1h30)' },
  H13: { startTime: '08:00', endTime: '17:00', lunchDuration: 60,  name: 'H13 - 08:00 às 17:00 (Almoço 1h)' },
  H14: { startTime: '08:15', endTime: '17:30', lunchDuration: 75,  name: 'H14 - 08:15 às 17:30 (Almoço 1h15)' },
  H15: { startTime: '08:30', endTime: '17:30', lunchDuration: 60,  name: 'H15 - 08:30 às 17:30 (Almoço 1h)' },
  H16: { startTime: '08:30', endTime: '17:30', lunchDuration: 60,  name: 'H16 - 08:30 às 17:30 (Almoço 1h)' },
  H17: { startTime: '08:30', endTime: '17:30', lunchDuration: 60,  name: 'H17 - 08:30 às 17:30 (Almoço 1h)' },
  H18: { startTime: '08:30', endTime: '17:45', lunchDuration: 75,  name: 'H18 - 08:30 às 17:45 (Almoço 1h15)' },
  H19: { startTime: '09:00', endTime: '18:00', lunchDuration: 60,  name: 'H19 - 09:00 às 18:00 (Almoço 1h)' },
  H20: { startTime: '09:00', endTime: '19:00', lunchDuration: 120, name: 'H20 - 09:00 às 19:00 (Almoço 2h)' },
  H21: { startTime: '09:00', endTime: '18:00', lunchDuration: 60,  name: 'H21 - 09:00 às 18:00 (Almoço 1h)' },
  H22: { startTime: '09:00', endTime: '17:35', lunchDuration: 60,  name: 'H22 - 09:00 às 17:35 (Almoço 1h)' },
  H23: { startTime: '09:00', endTime: '18:00', lunchDuration: 60,  name: 'H23 - 09:00 às 18:00 (Almoço 1h)' },
  H24: { startTime: '09:00', endTime: '18:00', lunchDuration: 60,  name: 'H24 - 09:00 às 18:00 (Almoço 1h)' },
  H25: { startTime: '09:00', endTime: '18:00', lunchDuration: 60,  name: 'H25 - 09:00 às 18:00 (Almoço 1h)' },
  H26: { startTime: '09:15', endTime: '18:30', lunchDuration: 75,  name: 'H26 - 09:15 às 18:30 (Almoço 1h15)' },
  H27: { startTime: '09:30', endTime: '18:30', lunchDuration: 60,  name: 'H27 - 09:30 às 18:30 (Almoço 1h)' },
  H28: { startTime: '10:00', endTime: '19:00', lunchDuration: 60,  name: 'H28 - 10:00 às 19:00 (Almoço 1h)' },
  H29: { startTime: '10:00', endTime: '19:30', lunchDuration: 90,  name: 'H29 - 10:00 às 19:30 (Almoço 1h30)' },
  H30: { startTime: '10:00', endTime: '19:00', lunchDuration: 60,  name: 'H30 - 10:00 às 19:00 (Almoço 1h)' },
};

async function main() {
  const user = await prisma.user.findFirst({
    where: { syncToken: 'pontual_sync_cmb_9f8b4d2a_2026' }
  });

  if (!user) {
    console.error('CMB user not found!');
    return;
  }

  console.log(`Setting up schedules for CMB (${user.id})...`);

  // 1. Create or update Schedule records
  const scheduleIdMap: Record<string, string> = {};

  for (const [code, def] of Object.entries(SCHEDULE_DEFINITIONS)) {
    let sched = await prisma.schedule.findFirst({
      where: { userId: user.id, name: def.name }
    });

    if (!sched) {
      sched = await prisma.schedule.create({
        data: {
          userId: user.id,
          name: def.name,
          startTime: def.startTime,
          endTime: def.endTime,
          lateTolerance: 20,
          lunchDuration: def.lunchDuration,
        }
      });
      console.log(`  + Created Schedule ${code}: ${def.name}`);
    } else {
      sched = await prisma.schedule.update({
        where: { id: sched.id },
        data: {
          startTime: def.startTime,
          endTime: def.endTime,
          lunchDuration: def.lunchDuration,
        }
      });
      console.log(`  ~ Updated Schedule ${code}: ${def.name}`);
    }
    scheduleIdMap[code] = sched.id;
  }

  // 2. Parse CMB.txt and assign employees to schedules
  const cmbText = fs.readFileSync('C:/Users/JD/Desktop/CMB.txt', 'utf8');
  const lines = cmbText.split('\n').filter(l => l.trim().length > 0);

  let assigned = 0;

  for (const line of lines.slice(1)) { // skip header
    const parts = line.split('\t');
    if (parts.length < 6) continue;
    const rawCode = parts[0].trim();
    const workno = rawCode.padStart(4, '0');
    const scheduleCode = parts[5].trim().toUpperCase();

    const schedId = scheduleIdMap[scheduleCode];
    if (schedId) {
      // Upsert EmployeeSchedule
      await prisma.employeeSchedule.upsert({
        where: { workno_scheduleId: { workno, scheduleId: schedId } },
        update: {},
        create: { workno, scheduleId: schedId }
      });

      // Update Employee record with schedule code and name
      const schedDef = SCHEDULE_DEFINITIONS[scheduleCode];
      await prisma.employee.updateMany({
        where: { userId: user.id, workno },
        data: {
          scheduleCode,
          scheduleName: schedDef?.name || scheduleCode
        }
      });

      assigned++;
      console.log(`  👤 Assigned ${workno} -> ${scheduleCode}`);
    }
  }

  console.log(`\nSuccessfully configured ${Object.keys(SCHEDULE_DEFINITIONS).length} schedules and assigned ${assigned} employees!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
