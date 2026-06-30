
import { startOfDay, differenceInMinutes, parseISO } from "date-fns";

// Configuração de Horários - Sincronizado com Anviz W1 Pro
// Última atualização: 12/02/2026
// IMPORTANTE: Manter sincronizado com configuração do dispositivo

export interface Schedule {
    id: string;
    name: string;
    startTime: string | { hour: number; minute: number };  // "HH:mm" in DB, object in legacy
    endTime: string | { hour: number; minute: number };    // "HH:mm" in DB, object in legacy
    lateToleranceMinutes?: number;                 // Legacy
    lateTolerance?: number;                        // DB
    earlyOutToleranceMinutes?: number;             // Legacy
    overtimeThresholdMinutes?: number;             // Legacy
    autoBreakDeduction?: {                         // Break automático descontado
        enabled: boolean;
        startWindow: { hour: number; minute: number };
        endWindow: { hour: number; minute: number };
        durationMinutes: number;
    };
    warningsDisabled?: boolean;                    // Disable lateness and other alerts
}

// Definição dos horários (sincronizado com Anviz W1 Pro)
export const SCHEDULES: Record<string, Schedule> = {
    'VE': {
        id: 'VE',
        name: 'Horário VE',
        startTime: { hour: 8, minute: 30 },
        endTime: { hour: 17, minute: 30 },
        lateToleranceMinutes: 20,
        earlyOutToleranceMinutes: 20,
        overtimeThresholdMinutes: 10,  // Só conta HE se >10min
        autoBreakDeduction: {
            enabled: true,              // Enabled as per user request
            startWindow: { hour: 12, minute: 0 },
            endWindow: { hour: 15, minute: 0 },
            durationMinutes: 60  // 1 hora de break
        }
    },
    'VE2': {
        id: 'VE2',
        name: 'Horário VE 2',
        startTime: { hour: 9, minute: 0 },
        endTime: { hour: 18, minute: 0 },
        lateToleranceMinutes: 20,  // CORRIGIDO: era 60, Anviz tem 20
        earlyOutToleranceMinutes: 20,  // CORRIGIDO: era 60, Anviz tem 20
        overtimeThresholdMinutes: 10,  // Só conta HE se >10min
        autoBreakDeduction: {
            enabled: true,              // Enabled as per user request
            startWindow: { hour: 12, minute: 0 },
            endWindow: { hour: 15, minute: 0 },
            durationMinutes: 60  // 1 hora de break
        }
    }
};

// Atribuição de colaboradores a horários
// Chave = workno (ID do funcionário), Valor = ID do horário
export const EMPLOYEE_SCHEDULES: Record<string, string> = {
    // Isabel Vaz tem Horário VE 2 (9h-18h)
    '3': 'VE2',

    // Todos os outros têm Horário VE por defeito (8:30-17:30)
};

// Horário padrão para quem não está especificado
export const DEFAULT_SCHEDULE_ID = 'VE';

export const VILA_PEIXOTO_RULES: Record<string, Partial<Schedule>> = {
    '7h-16h': { name: "Turno Júlio 7h-16h", startTime: "07:00", endTime: "16:00", lateToleranceMinutes: 15 },
    '9h-18h': { name: "Turno Geral 9h-18h", startTime: "09:00", endTime: "18:00", lateToleranceMinutes: 15 },
    '12h-22h': { name: "Turno 12h-22h", startTime: "12:00", endTime: "22:00", lateToleranceMinutes: 15 },
};

export const GENGIBRE_RULES: Record<string, Partial<Schedule>> = {
    'Turno A': { name: "Turno A 07h-16h", startTime: "07:00", endTime: "16:00", lateToleranceMinutes: 20 },
    'Turno B': { name: "Turno B 08h-17h", startTime: "08:00", endTime: "17:00", lateToleranceMinutes: 20 },
    'Turno C': { name: "Turno C 07:30-16:30", startTime: "07:30", endTime: "16:30", lateToleranceMinutes: 20 },
    'Turno D': { name: "Turno D 10h-19h", startTime: "10:00", endTime: "19:00", lateToleranceMinutes: 20 },
    'Benfica A': { name: "Turno A Benfica 09h-18h", startTime: "09:00", endTime: "18:00", lateToleranceMinutes: 20 },
    'Benfica B': { name: "Turno B Benfica 06h-15h", startTime: "06:00", endTime: "15:00", lateToleranceMinutes: 20 },
};

// Mapping for Vila Peixoto (Ana and Tabata are 12-22h, Julio is 7-16h, others 9-18h)
export function getVilaPeixotoSchedule(employeeName: string): Schedule {
    const name = employeeName.toLowerCase();

    // Turno Júlio 7h-16h
    if (name.includes('julio') || name.includes('júlio')) {
        return {
            id: 'auto-vp-7',
            ...VILA_PEIXOTO_RULES['7h-16h'],
            warningsDisabled: true // DESLIGADO as per user request
        } as Schedule;
    }

    // Turno 12h-22h (Ana, Tabata, Carla, Rosandra)
    if (name.includes('ana') || name.includes('tabata') || name.includes('tábata') || name.includes('carla') || name.includes('rosandra')) {
        return {
            id: 'auto-vp-12',
            ...VILA_PEIXOTO_RULES['12h-22h'],
            warningsDisabled: true // DESLIGADO as per user request
        } as Schedule;
    }

    // Turno Geral 9h-18h (Paulo Jorge, Rosandra, etc.)
    return {
        id: 'auto-vp-9',
        ...VILA_PEIXOTO_RULES['9h-18h'],
        warningsDisabled: true // DESLIGADO as per user request
    } as Schedule;
}

// ============================================================
// Official Gengibre / Cozinha Criativa shifts (confirmed by client):
//
// Turno A          07:30 - 16:30  → Wellington Silva, Ana Freitas
// Turno B          08:30 - 17:30  → Rheinner Oliveira, Rosangela Ferreira
// Turno C          07:30 - 16:30  → Mohammad Ripon, Raul Fonseca
// Turno D          10:00 - 19:00  → Deila Moreno, Bruno Carmo
// Turno A Benfica  09:00 - 18:00  → Vasco Silva, Ademir Domingues, Caio Santos, Sandra Mendes, Carolina Petra
// Turno B Benfica  06:30 - 15:30  → Anaís Lima
// ============================================================
export function getGengibreSchedule(employeeName: string, employeeId?: string | number): Schedule {
    const name = employeeName.toLowerCase().trim();

    const tA = { id: 'gg-a', name: 'Turno A 07:30h', startTime: '07:30', endTime: '16:30', lateToleranceMinutes: 20 } as Schedule;
    const tB = { id: 'gg-b', name: 'Turno B 08:30h', startTime: '08:30', endTime: '17:30', lateToleranceMinutes: 20 } as Schedule;
    const tC = { id: 'gg-c', name: 'Turno C 07:30h', startTime: '07:30', endTime: '16:30', lateToleranceMinutes: 20 } as Schedule;
    const tD = { id: 'gg-d', name: 'Turno D 10:00h', startTime: '10:00', endTime: '19:00', lateToleranceMinutes: 20 } as Schedule;
    const tAB = { id: 'gg-ab', name: 'Turno A Benfica 09:00h', startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 20 } as Schedule;
    const tBB = { id: 'gg-bb', name: 'Turno B Benfica 06:30h', startTime: '06:30', endTime: '15:30', lateToleranceMinutes: 20 } as Schedule;

    // Turno A (07:30) — Wellington Silva, Ana Freitas
    if (name.includes('wellington silva')) return tA;
    if (name.includes('ana freitas')) return tA;

    // Turno B (08:30) — Rheinner Oliveira, Rosangela Ferreira
    if (name.includes('rheinner')) return tB;
    if (name.includes('rosangela')) return tB;

    // Turno C (07:30) — Mohammad Ripon, Raul Fonseca
    if (name.includes('mohammad') || name.includes('ripon')) return tC;
    if (name.includes('raul') || name.includes('fonseca')) return tC;

    // Turno D (10:00) — Deila Moreno, Bruno Carmo
    if (name.includes('deila') || name.includes('moreno')) return tD;
    if (name.includes('bruno') || name.includes('carmo')) return tD;

    // Turno A Benfica (09:00) — Vasco Silva, Ademir Domingues, Caio Santos, Sandra Mendes, Carolina Petra
    if (name.includes('vasco')) return tAB;
    if (name.includes('ademir')) return tAB;
    if (name.includes('caio')) return tAB;
    if (name.includes('sandra') && name.includes('mendes')) return tAB;
    if (name.includes('carolina')) return tAB;

    // Turno B Benfica (06:30) — Anaís Lima
    if (name.includes('ana') && name.includes('lima')) return tBB;
    if (name.includes('anaís') || name.includes('anais')) return tBB;

    // Default fallback — Turno A Benfica (09:00) is the most common
    return tAB;
}

/**
 * Obtém o departamento de um colaborador (Benfica ou Amadora) para Cozinha Criativa
 */
export function getGengibreDepartment(employeeName: string): string {
    const name = employeeName.toLowerCase().trim();
    
    // Benfica
    if (name.includes('vasco') || 
        name.includes('ademir') || 
        name.includes('caio') || 
        name.includes('sandra mendes') || 
        name.includes('carolina petra') || 
        name.includes('anaís lima') || 
        name.includes('anais lima')) {
        return "Benfica";
    }
    
    // Default fallback - Amadora (most common or per client image)
    return "Amadora";
}



/**
 * Helper to get hour/minute from either string "HH:mm" or legacy object {hour, minute}
 */
function parseTime(time: string | { hour: number; minute: number }): { hour: number; minute: number } {
    if (typeof time === 'string') {
        const [h, m] = time.split(':').map(Number);
        return { hour: h, minute: m };
    }
    return time;
}

/**
 * Obtém o horário de um colaborador (Legacy wrapper - only works with hardcoded values)
 */
export function getEmployeeSchedule(workno: string): Schedule {
    const scheduleId = EMPLOYEE_SCHEDULES[workno] || DEFAULT_SCHEDULE_ID;
    return SCHEDULES[scheduleId];
}

/**
 * Verifica se um colaborador chegou atrasado
 */
export function isLate(checkInTime: Date, schedule?: Schedule): boolean {
    if (!schedule || schedule.warningsDisabled) return false;

    const startTime = parseTime(schedule.startTime);
    const tolerance = schedule.lateTolerance ?? schedule.lateToleranceMinutes ?? 0;

    // Convert check-in time to minutes from midnight in the LOCAL timezone of the check-in
    // This is safer than just getHours() if the Date object was parsed from a local string.
    const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    const limitMinutesFromMidnight = startTime.hour * 60 + startTime.minute + tolerance;

    return checkInMinutes > limitMinutesFromMidnight;
}

/**
 * Calcula horas extra de um dia
 */
export function calculateOvertime(
    firstCheckIn: Date,
    lastCheckOut: Date | null,
    schedule?: Schedule
): number {
    if (!schedule) return 0;

    const startTime = parseTime(schedule.startTime);
    const endTime = parseTime(schedule.endTime);
    const threshold = schedule.overtimeThresholdMinutes ?? 10;

    let overtimeMinutes = 0;

    // Entrada antecipada
    const scheduledStartMinutes = startTime.hour * 60 + startTime.minute;
    const actualStartMinutes = firstCheckIn.getHours() * 60 + firstCheckIn.getMinutes();

    if (actualStartMinutes < scheduledStartMinutes) {
        const earlyMinutes = scheduledStartMinutes - actualStartMinutes;
        if (earlyMinutes >= threshold) overtimeMinutes += earlyMinutes;
    }

    // Saída tardia
    if (lastCheckOut) {
        const scheduledEndMinutes = endTime.hour * 60 + endTime.minute;
        const actualEndMinutes = lastCheckOut.getHours() * 60 + lastCheckOut.getMinutes();

        if (actualEndMinutes > scheduledEndMinutes) {
            const lateMinutes = actualEndMinutes - scheduledEndMinutes;
            if (lateMinutes >= threshold) overtimeMinutes += lateMinutes;
        }
    }

    return overtimeMinutes;
}

/**
 * Calcula horas normais trabalhadas (sem horas extra, COM desconto de break)
 */
export function calculateRegularHours(workedMinutes: number, schedule?: Schedule): number {
    if (!schedule) return workedMinutes;

    const { autoBreakDeduction } = schedule;

    if (autoBreakDeduction?.enabled && workedMinutes >= autoBreakDeduction.durationMinutes) {
        return Math.max(0, workedMinutes - autoBreakDeduction.durationMinutes);
    }

    return workedMinutes;
}

/**
 * Obtém informação formatada do horário
 */
export function getFormattedScheduleInfo(schedule?: Schedule): {
    scheduleName: string;
    startTimeStr: string;
    endTimeStr: string;
    regularHours: string;
    breakInfo: string;
} {
    if (!schedule) {
        return {
            scheduleName: 'Sem Horário',
            startTimeStr: '--:--',
            endTimeStr: '--:--',
            regularHours: '0h',
            breakInfo: 'Não definido'
        };
    }

    const start = parseTime(schedule.startTime);
    const end = parseTime(schedule.endTime);
    const breakDeduction = schedule.autoBreakDeduction?.enabled ? schedule.autoBreakDeduction.durationMinutes : 0;

    const totalMinutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
    const workMinutes = Math.max(0, totalMinutes - breakDeduction);

    const regularHours = Math.floor(workMinutes / 60);
    const regularMins = workMinutes % 60;

    return {
        scheduleName: schedule.name,
        startTimeStr: `${start.hour.toString().padStart(2, '0')}:${start.minute.toString().padStart(2, '0')}`,
        endTimeStr: `${end.hour.toString().padStart(2, '0')}:${end.minute.toString().padStart(2, '0')}`,
        regularHours: `${regularHours}h${regularMins > 0 ? ` ${regularMins}m` : ''}`,
        breakInfo: schedule.autoBreakDeduction?.enabled
            ? `${Math.floor(schedule.autoBreakDeduction.durationMinutes / 60)}h ${schedule.autoBreakDeduction.durationMinutes % 60}m`
            : 'Sem break automático'
    };
}

/**
 * Calculates work hours with Smart Break Deduction and Daily Overtime logic.
 * 
 * Logic:
 * 1. Calculate total duration from first In to last Out.
 * 2. Calculate actual break taken (gaps between Out and In).
 * 3. Smart Deduction:
 *    - If Total Elapsed > 6 hours AND Actual Break < 1 hour:
 *      - Deduct (1 hour - Actual Break) from total work time.
 * 4. Overtime:
 *    - Regular Hours cap at 8h.
 *    - Overtime = Net Work Hours - 8h.
 */
export function calculateSmartWorkHours(
    checks: { time: string | Date | number, type: number }[],
    options?: { isGengibre?: boolean }
) {
    const isGengibre = options?.isGengibre || false;

    if (checks.length === 0) {
        return { regularHours: 0, overtimeHours: 0, totalWorkMs: 0, deductionMs: 0 };
    }

    // Normalize times to number (ms)
    const sorted = [...checks].map(c => ({
        time: c.time instanceof Date ? c.time.getTime() : (typeof c.time === 'string' ? parseISO(c.time).getTime() : c.time),
        type: c.type
    })).sort((a, b) => a.time - b.time);

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (sorted.length < 2) {
        if (sorted.length === 1 && isGengibre) {
            // Rule 3: Single Punch
            const checkDate = new Date(first.time);
            const hour = checkDate.getHours();
            const minute = checkDate.getMinutes();
            const pMin = hour * 60 + minute;
            
            const observation = pMin < 780 ? "Falta picagem Saída" : "Falta picagem Entrada";
            
            return {
                regularHours: 0,
                overtimeHours: 0,
                totalWorkMs: 0,
                deductionMs: 0,
                observation
            };
        }
        return { regularHours: 0, overtimeHours: 0, totalWorkMs: 0, deductionMs: 0 };
    }

    const rawDurMs = last.time - first.time;
    const rawDurMin = rawDurMs / 60000;

    if (isGengibre) {
        // Gengibre Rules
        if (rawDurMin <= 15) {
            // Rule 3: Double Punch Error
            return {
                regularHours: 0,
                overtimeHours: 0,
                totalWorkMs: 0,
                deductionMs: 0,
                observation: "Erro: Dupla picagem"
            };
        }

        let durMin = rawDurMin;
        let deductionMin = 0;
        if (durMin > 360) {
            durMin -= 60; // Lunch deduction (1h = 60m)
            deductionMin = 60;
        }

        // Daily Overtime: triggered if worked > 495 mins (8h15m)
        let overtimeMin = 0;
        if (durMin > 495) {
            overtimeMin = durMin - 480; // Overtime is durMin - 8h (480m)
        }

        const netWorkMin = durMin;
        const totalWorkMs = netWorkMin * 60000;
        const deductionMs = deductionMin * 60000;

        const overtimeHours = overtimeMin / 60;
        const regularHours = Math.min(durMin, 480) / 60;

        return {
            regularHours,
            overtimeHours,
            totalWorkMs,
            deductionMs
        };
    } else {
        // Default standard rules for other companies (unchanged)
        let totalWorkMs = 0;
        let lastInTime: number | null = null;
        let breakDurationMs = 0;
        let lastOutTime: number | null = null;

        sorted.forEach(record => {
            const time = record.time;
            const isEntry = record.type === 0 || record.type === 128 || record.type === 3;
            const isExit = record.type === 1 || record.type === 129 || record.type === 2;

            if (isEntry) {
                lastInTime = time;
                if (lastOutTime !== null) {
                    breakDurationMs += (time - lastOutTime);
                    lastOutTime = null;
                }
            } else if (isExit && lastInTime !== null) {
                totalWorkMs += (time - lastInTime);
                lastOutTime = time;
                lastInTime = null;
            }
        });

        const totalElapsedMs = last.time - first.time;
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        let deductionMs = 0;

        if (totalElapsedMs > SIX_HOURS_MS) {
            if (breakDurationMs < ONE_HOUR_MS) {
                deductionMs = Math.min(totalWorkMs, ONE_HOUR_MS - breakDurationMs);
            }
        }

        const netWorkMs = Math.max(0, totalWorkMs - deductionMs);
        const netWorkHours = netWorkMs / (1000 * 60 * 60);

        const overtimeHoursNum = Math.max(0, netWorkHours - 8);
        const regularHoursNum = Math.min(netWorkHours, 8);

        return {
            regularHours: regularHoursNum,
            overtimeHours: overtimeHoursNum,
            totalWorkMs: netWorkMs,
            deductionMs
        };
    }
}
