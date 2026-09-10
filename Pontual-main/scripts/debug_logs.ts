import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find CMB user
  const user = await prisma.user.findFirst({
    where: { syncToken: 'pontual_sync_cmb_9f8b4d2a_2026' }
  });

  if (!user) { console.log('CMB user not found!'); return; }
  console.log('CMB User:', user.id, user.name, 'Provider:', user.biometricProvider);

  // Count total logs
  const total = await prisma.attendanceLog.count({ where: { userId: user.id } });
  console.log('\nTotal AttendanceLogs:', total);

  // Date range of logs
  const oldest = await prisma.attendanceLog.findFirst({
    where: { userId: user.id }, orderBy: { checktime: 'asc' }
  });
  const newest = await prisma.attendanceLog.findFirst({
    where: { userId: user.id }, orderBy: { checktime: 'desc' }
  });

  console.log('Oldest record:', oldest?.checktime, '| workno:', oldest?.workno, '| name:', oldest?.employeeName);
  console.log('Newest record:', newest?.checktime, '| workno:', newest?.workno, '| name:', newest?.employeeName);

  // Sample of unique employees
  const logs = await prisma.attendanceLog.findMany({
    where: { userId: user.id },
    select: { workno: true, employeeName: true, checktime: true, checktype: true },
    orderBy: { checktime: 'desc' },
    take: 10
  });

  console.log('\nLast 10 records:');
  logs.forEach(l => console.log(` - ${l.checktime.toISOString()} | type:${l.checktype} | workno:${l.workno} | ${l.employeeName}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
