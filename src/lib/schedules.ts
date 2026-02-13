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
            enabled: false,
            startWindow: { hour: 12, minute: 0 },
            endWindow: { hour: 15, minute: 0 },
            durationMinutes: 60  // 1 hora de break (agora manual)
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
            enabled: false,
            startWindow: { hour: 12, minute: 0 },
            endWindow: { hour: 15, minute: 0 },
            durationMinutes: 60  // 1 hora de break (agora manual)
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
