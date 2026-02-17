
import { startOfDay, differenceInMinutes, parseISO } from "date-fns";

// Configuração de Horários - Sincronizado com Anviz W1 Pro
// Última atualização: 12/02/2026
// IMPORTANTE: Manter sincronizado com configuração do dispositivo

export interface Schedule {
    id: string;
    name: string;
    startTime: { hour: number; minute: number };  // Hora de entrada normal
    endTime: { hour: number; minute: number };    // Hora de saída normal
    lateToleranceMinutes: number;                 // Tolerância para marcar atraso
    earlyOutToleranceMinutes: number;             // Tolerância para saída antecipada
    overtimeThresholdMinutes: number;             // Mínimo de minutos para contar HE
    autoBreakDeduction: {                         // Break automático descontado
        enabled: boolean;
        startWindow: { hour: number; minute: number };
        endWindow: { hour: number; minute: number };
        durationMinutes: number;
    };
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

/**
 * Obtém o horário de um colaborador
 */
export function getEmployeeSchedule(workno: string): Schedule {
    const scheduleId = EMPLOYEE_SCHEDULES[workno] || DEFAULT_SCHEDULE_ID;
    return SCHEDULES[scheduleId];
}

/**
 * Verifica se um colaborador chegou atrasado
 */
export function isLate(workno: string, checkInTime: Date): boolean {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, lateToleranceMinutes } = schedule;

    // Calcular hora limite (entrada + tolerância)
    const limitHour = startTime.hour;
    const limitMinute = startTime.minute + lateToleranceMinutes;

    const checkHour = checkInTime.getHours();
    const checkMinute = checkInTime.getMinutes();

    // Converter para minutos desde meia-noite para comparar
    const limitInMinutes = limitHour * 60 + limitMinute;
    const checkInMinutes = checkHour * 60 + checkMinute;

    return checkInMinutes > limitInMinutes;
}

/**
 * Calcula horas extra de um dia
 * HE = tempo antes da entrada normal + tempo depois da saída normal
 * IMPORTANTE: Só conta se >= overtimeThresholdMinutes (10 min no Anviz)
 */
export function calculateOvertime(
    workno: string,
    firstCheckIn: Date,
    lastCheckOut: Date | null
): number {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, endTime, overtimeThresholdMinutes } = schedule;

    let overtimeMinutes = 0;

    // Horas extra por entrada antecipada (antes do horário normal)
    const scheduledStartMinutes = startTime.hour * 60 + startTime.minute;
    const actualStartMinutes = firstCheckIn.getHours() * 60 + firstCheckIn.getMinutes();

    if (actualStartMinutes < scheduledStartMinutes) {
        const earlyMinutes = scheduledStartMinutes - actualStartMinutes;
        // Só conta se >= threshold
        if (earlyMinutes >= overtimeThresholdMinutes) {
            overtimeMinutes += earlyMinutes;
        }
    }

    // Horas extra por saída tardia (depois do horário normal)
    if (lastCheckOut) {
        const scheduledEndMinutes = endTime.hour * 60 + endTime.minute;
        const actualEndMinutes = lastCheckOut.getHours() * 60 + lastCheckOut.getMinutes();

        if (actualEndMinutes > scheduledEndMinutes) {
            const lateMinutes = actualEndMinutes - scheduledEndMinutes;
            // Só conta se >= threshold
            if (lateMinutes >= overtimeThresholdMinutes) {
                overtimeMinutes += lateMinutes;
            }
        }
    }

    return overtimeMinutes;
}

/**
 * Calcula horas normais trabalhadas (sem horas extra, COM desconto de break)
 * IMPORTANTE: Anviz desconta automaticamente 1h de break se trabalhar entre 12:00-15:00
 */
export function calculateRegularHours(workno: string, workedMinutes: number): number {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, endTime, autoBreakDeduction } = schedule;

    const startMinutes = startTime.hour * 60 + startTime.minute;
    const endMinutes = endTime.hour * 60 + endTime.minute;
    const scheduledMinutes = endMinutes - startMinutes;

    // Se break automático está ativo e colaborador trabalhou tempo suficiente
    if (autoBreakDeduction.enabled && workedMinutes >= autoBreakDeduction.durationMinutes) {
        // Descontar break
        return Math.max(0, workedMinutes - autoBreakDeduction.durationMinutes);
    }

    return workedMinutes;
}

/**
 * Obtém informação formatada do horário
 */
export function getScheduleInfo(workno: string): {
    scheduleName: string;
    startTimeStr: string;
    endTimeStr: string;
    regularHours: string;
    breakInfo: string;
} {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, endTime, autoBreakDeduction } = schedule;

    const startMinutes = startTime.hour * 60 + startTime.minute;
    const endMinutes = endTime.hour * 60 + endTime.minute;
    const totalMinutes = endMinutes - startMinutes;

    // Descontar break se ativo
    const workMinutes = autoBreakDeduction.enabled
        ? totalMinutes - autoBreakDeduction.durationMinutes
        : totalMinutes;

    const regularHours = Math.floor(workMinutes / 60);
    const regularMins = workMinutes % 60;

    const breakHours = Math.floor(autoBreakDeduction.durationMinutes / 60);
    const breakMins = autoBreakDeduction.durationMinutes % 60;

    return {
        scheduleName: schedule.name,
        startTimeStr: `${startTime.hour.toString().padStart(2, '0')}:${startTime.minute.toString().padStart(2, '0')}`,
        endTimeStr: `${endTime.hour.toString().padStart(2, '0')}:${endTime.minute.toString().padStart(2, '0')}`,
        regularHours: `${regularHours}h${regularMins > 0 ? ` ${regularMins}m` : ''}`,
        breakInfo: autoBreakDeduction.enabled
            ? `${breakHours}h${breakMins > 0 ? ` ${breakMins}m` : ''} (12:00-15:00)`
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
