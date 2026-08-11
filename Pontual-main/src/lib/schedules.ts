
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
    const tAdemir = { ...tAB, id: 'gg-ademir', name: 'Benfica (Isenção)', warningsDisabled: true };
    const tBB = { id: 'gg-bb', name: 'Turno B Benfica 06:30h', startTime: '06:30', endTime: '15:30', lateToleranceMinutes: 20 } as Schedule;
    const tE = { id: 'gg-e', name: 'Turno E (09:00h)', startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 20 } as Schedule;
    const tF = { id: 'gg-f', name: 'Turno F (13:30h)', startTime: '13:30', endTime: '22:30', lateToleranceMinutes: 20 } as Schedule;
    const tEvelyn = { id: 'gg-evelyn', name: 'Chefe Cozinha (12h-21h)', startTime: '12:00', endTime: '21:00', lateToleranceMinutes: 60, warningsDisabled: true } as Schedule;

    // Isenção / Chefe Cozinha — Evelyn Novaes (ID 18)
    if (name.includes('evelyn') || String(employeeId) === '18') return tEvelyn;

    // Novos Colaboradores Amadora (IDs 16 e 17)
    if (name.includes('ana carolina') || String(employeeId) === '16') return tF;
    if (name.includes('widler') || String(employeeId) === '17') return tE;

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
    if (name.includes('ademir') || String(employeeId) === '11') return tAdemir;
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
 * REGRAS DE CÁLCULO POR CLIENTE
 */
export const CLIENT_RULES = {
    GENGIBRE: {
        overtimeTolerance: 15,
        subtractTolerance: false,
        mealBreakMinutes: 60,
        mealBreakThresholdHours: 6,
        exemptIds: ['11', '18'],
        overtimeCapHours: 8
    },
    VE: {
        overtimeTolerance: 5,
        subtractTolerance: true, // Se trabalhar 8h06m, ganha 1 min (6-5=1)
        mealBreakMinutes: 60,
        mealBreakThresholdHours: 6,
        exemptIds: [],
        overtimeCapHours: 8
    },
    VP: {
        overtimeTolerance: 0,
        subtractTolerance: false,
        mealBreakMinutes: 60,
        mealBreakThresholdHours: 6,
        exemptIds: [],
        overtimeCapHours: 8
    }
};

/**
 * Detecta qual o cliente baseado no nome da empresa
 */
export function getClientRules(companyName: string = "") {
    const name = companyName.toLowerCase();
    if (name.includes("gengibre") || name.includes("cozinha criativa")) return CLIENT_RULES.GENGIBRE;
    if (name.includes("ve") || name.includes("vontade e empenho")) return CLIENT_RULES.VE;
    if (name.includes("vila peixoto") || name.includes("vp")) return CLIENT_RULES.VP;
    return CLIENT_RULES.GENGIBRE; // Fallback
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
export function calculateSmartWorkHours(checks: { time: string | Date | number, type: number }[], companyName: string = "") {
    const rules = getClientRules(companyName);
    
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

    // Use rules for deduction
    const MEAL_BREAK_MS = rules.mealBreakMinutes * 60 * 1000;
    const THRESHOLD_MS = rules.mealBreakThresholdHours * 60 * 60 * 1000;
    let deductionMs = 0;

    if (totalElapsedMs > THRESHOLD_MS) {
        if (breakDurationMs < MEAL_BREAK_MS) {
            // Deduct the remaining part of the hour not taken as break
            deductionMs = Math.min(totalWorkMs, MEAL_BREAK_MS - breakDurationMs);
        }
    }

    const netWorkMs = Math.max(0, totalWorkMs - deductionMs);
    const netWorkHours = netWorkMs / (1000 * 60 * 60);

    // Overtime rule: Anything above cap hours is overtime
    const capHours = rules.overtimeCapHours;
    let overtimeHoursNum = Math.max(0, netWorkHours - capHours);
    const regularHoursNum = Math.min(netWorkHours, capHours);

    // Tolerance check
    const toleranceHours = rules.overtimeTolerance / 60;
    if (overtimeHoursNum < (rules.overtimeTolerance + (rules.subtractTolerance ? 1 : 0)) / 60) {
        // If below tolerance, no OT
        if (overtimeHoursNum <= toleranceHours) {
            overtimeHoursNum = 0;
        } else if (rules.subtractTolerance) {
            // If VE style: 8h06m -> 1m OT. (0.1h - 0.083h = 0.016h)
            overtimeHoursNum = overtimeHoursNum - toleranceHours;
        }
    } else if (rules.subtractTolerance) {
        // Always subtract tolerance if configured
        overtimeHoursNum = overtimeHoursNum - toleranceHours;
    }

    return {
        regularHours: regularHoursNum,
        overtimeHours: overtimeHoursNum,
        totalWorkMs: netWorkMs,
        deductionMs
    };
}
