
// Simulation script to verify the new logic 
// (Checking Sum(Out-In) vs old Last-First)

interface SimRecord {
    checktime: string;
    checktype: number;
}

function calculateWork(records: SimRecord[]) {
    // Sort logic
    const sorted = [...records].sort((a, b) => new Date(a.checktime).getTime() - new Date(b.checktime).getTime());

    // Sum logic
    let workDurationMs = 0;
    let lastInTime: number | null = null;
    let log: string[] = [];

    sorted.forEach(record => {
        const time = new Date(record.checktime).getTime();
        const isEntry = record.checktype === 0 || record.checktype === 128;
        const isExit = record.checktype === 1 || record.checktype === 129;

        if (isEntry) {
            lastInTime = time;
            log.push(`IN at ${record.checktime}`);
        } else if (isExit && lastInTime !== null) {
            const segment = time - lastInTime;
            workDurationMs += segment;
            log.push(`OUT at ${record.checktime} (+${segment / 1000 / 60} min)`);
            lastInTime = null;
        }
    });

    const hours = Math.floor(workDurationMs / (1000 * 60 * 60));
    const minutes = Math.floor((workDurationMs % (1000 * 60 * 60)) / (1000 * 60));
    const standardWorkDayMs = 8 * 60 * 60 * 1000;
    const overtimeMs = Math.max(0, workDurationMs - standardWorkDayMs);
    const otHours = Math.floor(overtimeMs / (1000 * 60 * 60));
    const otMinutes = Math.floor((overtimeMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
        total: `${hours}h ${minutes}m`,
        overtime: `${otHours}h ${otMinutes}m`,
        log
    };
}

// Scenario 1: Standard Day 9-18 (1h lunch)
console.log("--- Scenario 1: Standard Day ---");
const records1 = [
    { checktime: "2024-02-02T09:00:00", checktype: 0 },
    { checktime: "2024-02-02T13:00:00", checktype: 1 }, // Lunch start
    { checktime: "2024-02-02T14:00:00", checktype: 0 }, // Lunch end
    { checktime: "2024-02-02T18:00:00", checktype: 1 },
];
console.log(calculateWork(records1));
// Expected: 8h 0m total, 0h overtime

// Scenario 2: Late Night +1h Overtime
console.log("\n--- Scenario 2: Overtime ---");
const records2 = [
    { checktime: "2024-02-02T09:00:00", checktype: 0 },
    { checktime: "2024-02-02T13:00:00", checktype: 1 },
    { checktime: "2024-02-02T14:00:00", checktype: 0 },
    { checktime: "2024-02-02T19:00:00", checktype: 1 }, // Worked until 19
];
console.log(calculateWork(records2));
// Expected: 9h 0m total, 1h 0m overtime

// Scenario 3: Missing Out Punch (Forgot to clock out for lunch)
console.log("\n--- Scenario 3: Missing Punch ---");
const records3 = [
    { checktime: "2024-02-02T09:00:00", checktype: 0 },
    { checktime: "2024-02-02T14:00:00", checktype: 1 }, // Just one block 9-14
    // User forgot to clock back in or out?
    // Actually simulates: IN 9:00, OUT 14:00. 5h worked.
];
console.log(calculateWork(records3));
