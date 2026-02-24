import { prisma } from '../src/lib/db';

async function dump() {
    const schedules = await prisma.schedule.findMany({
        include: { employeeSchedules: true }
    });
    console.log(JSON.stringify(schedules, null, 2));
}
dump();
