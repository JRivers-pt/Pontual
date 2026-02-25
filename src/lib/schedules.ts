
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
    '7h-16h': { name: "Turno Júlio 7h-16h", startTime: "07:00", endTime: "16:00", lateTolerance: 15 },
    '9h-18h': { name: "Turno Geral 9h-18h", startTime: "09:00", endTime: "18:00", lateTolerance: 15 },
    '12h-22h': { name: "Turno 12h-22h", startTime: "12:00", endTime: "22:00", lateTolerance: 15 },
};

export const GENGIBRE_RULES: Record<string, Partial<Schedule>> = {
    'Turno A': { name: "Turno A 07h-16h", startTime: "07:00", endTime: "16:00", lateTolerance: 20 },
    'Turno B': { name: "Turno B 08h-17h", startTime: "08:00", endTime: "17:00", lateTolerance: 20 },
    'Turno C': { name: "Turno C 07:30-16:30", startTime: "07:30", endTime: "16:30", lateTolerance: 20 },
    'Turno D': { name: "Turno D 10h-19h", startTime: "10:00", endTime: "19:00", lateTolerance: 20 },
    'Benfica A': { name: "Turno A Benfica 09h-18h", startTime: "09:00", endTime: "18:00", lateTolerance: 20 },
    'Benfica B': { name: "Turno B Benfica 06h-15h", startTime: "06:00", endTime: "15:00", lateTolerance: 20 },
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

// Mapping for Gengibre / Cozinha Criativa
export function getGengibreSchedule(employeeName: string, employeeId?: string | number): Schedule {
    const name = employeeName.toLowerCase();
    const id = employeeId ? String(employeeId) : undefined;

    // console.log(`[getGengibreSchedule] Mapping for ${employeeName} (ID: ${id})`);

    // Map by ID (most reliable)
    // IDs based on the dashboard screenshot
    if (id === '2') return { id: 'auto-gg-c', ...GENGIBRE_RULES['Turno C'] } as Schedule; // Ana Freitas (06:53)
    if (id === '8') return { id: 'auto-gg-d', ...GENGIBRE_RULES['Turno D'] } as Schedule; // Bruno Carmo (09:55)
    if (id === '12') return { id: 'auto-gg-d', ...GENGIBRE_RULES['Turno D'] } as Schedule; // Caio Santos (09:02)
    if (id === '3') return { id: 'auto-gg-ben-a', ...GENGIBRE_RULES['Benfica A'] } as Schedule; // Carolina Petra (08:50)
    if (id === '6') return { id: 'auto-gg-ben-a', ...GENGIBRE_RULES['Benfica A'] } as Schedule; // Della Moreno (08:59)

    // Fallback search by name
    if (name.includes('ana freitas')) return { id: 'auto-gg-c', ...GENGIBRE_RULES['Turno C'] } as Schedule;
    if (name.includes('bruno carmo')) return { id: 'auto-gg-d', ...GENGIBRE_RULES['Turno D'] } as Schedule;
    if (name.includes('caio santos')) return { id: 'auto-gg-d', ...GENGIBRE_RULES['Turno D'] } as Schedule;
    if (name.includes('carolina petra')) return { id: 'auto-gg-ben-a', ...GENGIBRE_RULES['Benfica A'] } as Schedule;
    if (name.includes('della moreno')) return { id: 'auto-gg-ben-a', ...GENGIBRE_RULES['Benfica A'] } as Schedule;
    if (name.includes('delia moreno')) return { id: 'auto-gg-ben-a', ...GENGIBRE_RULES['Benfica A'] } as Schedule;
    if (name.includes('wellington silva')) return { id: 'auto-gg-a', ...GENGIBRE_RULES['Turno A'] } as Schedule;

    // Default to Turno A Benfica (09:00 - 18:00) 
    return {
        id: 'auto-gg-default',
        ...GENGIBRE_RULES['Benfica A'],
        warningsDisabled: false
    } as Schedule;
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

    const result = checkInMinutes > limitMinutesFromMidnight;

    // console.log(`[isLate] ${schedule.name} | checkIn: ${checkInMinutes} | limit: ${limitMinutesFromMidnight} | result: ${result}`);

    return result;
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
export function calculateSmartWorkHours(checks: { time: string | Date | number, type: number }[]) {
    if (checks.length < 2) return { regularHours: 0, overtimeHours: 0, totalWorkMs: 0 };

    // Normalize times to number (ms)
    const sorted = [...checks].map(c => ({
        time: c.time instanceof Date ? c.time.getTime() : (typeof c.time === 'string' ? parseISO(c.time).getTime() : c.time),
        type: c.type
    })).sort((a, b) => a.time - b.time);

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let totalWorkMs = 0;
    let lastInTime: number | null = null;
    let breakDurationMs = 0;
    let lastOutTime: number | null = null;

    sorted.forEach(record => {
        const time = record.time;
        // Entry types: Check-In (0), Overtime In (128), Break End (3)
        const isEntry = record.type === 0 || record.type === 128 || record.type === 3;
        // Exit types: Check-Out (1), Overtime Out (129), Break Start (2)
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

    // Smart Deduction Logic
    const totalElapsedMs = last.time - first.time;

    // Only apply deduction if total elapsed is > 6 hours (6 * 60 * 60 * 1000)
    // AND break taken is < 1 hour
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    let deductionMs = 0;

    if (totalElapsedMs > SIX_HOURS_MS) {
        if (breakDurationMs < ONE_HOUR_MS) {
            // Deduct the remaining part of the hour not taken as break
            deductionMs = Math.min(totalWorkMs, ONE_HOUR_MS - breakDurationMs);
        }
    }

    const netWorkMs = Math.max(0, totalWorkMs - deductionMs);
    const netWorkHours = netWorkMs / (1000 * 60 * 60);

    // Overtime rule: Anything above 8 hours is overtime
    const overtimeHoursNum = Math.max(0, netWorkHours - 8);
    const regularHoursNum = Math.min(netWorkHours, 8);

    return {
        regularHours: regularHoursNum,
        overtimeHours: overtimeHoursNum,
        totalWorkMs: netWorkMs,
        deductionMs
    };
}
