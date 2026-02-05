// Configuração de Horários - Hardcoded para VE Vontade e Empenho
// Atualizar este ficheiro quando houver mudanças nos horários

export interface Schedule {
    id: string;
    name: string;
    startTime: { hour: number; minute: number };  // Hora de entrada normal
    endTime: { hour: number; minute: number };    // Hora de saída normal
    lateToleranceMinutes: number;                 // Tolerância para marcar atraso
    earlyOutToleranceMinutes: number;             // Tolerância para saída antecipada
    // Horas extra contam se entrar antes de startTime ou sair depois de endTime
}

// Definição dos horários
export const SCHEDULES: Record<string, Schedule> = {
    'VE': {
        id: 'VE',
        name: 'Horário VE',
        startTime: { hour: 8, minute: 30 },
        endTime: { hour: 17, minute: 30 },
        lateToleranceMinutes: 20,
        earlyOutToleranceMinutes: 20,
    },
    'VE2': {
        id: 'VE2',
        name: 'Horário VE 2',
        startTime: { hour: 9, minute: 0 },
        endTime: { hour: 18, minute: 0 },
        lateToleranceMinutes: 60,
        earlyOutToleranceMinutes: 60,
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
 */
export function calculateOvertime(
    workno: string,
    firstCheckIn: Date,
    lastCheckOut: Date | null
): number {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, endTime } = schedule;

    let overtimeMinutes = 0;

    // Horas extra por entrada antecipada (antes do horário normal)
    const scheduledStartMinutes = startTime.hour * 60 + startTime.minute;
    const actualStartMinutes = firstCheckIn.getHours() * 60 + firstCheckIn.getMinutes();

    if (actualStartMinutes < scheduledStartMinutes) {
        overtimeMinutes += (scheduledStartMinutes - actualStartMinutes);
    }

    // Horas extra por saída tardia (depois do horário normal)
    if (lastCheckOut) {
        const scheduledEndMinutes = endTime.hour * 60 + endTime.minute;
        const actualEndMinutes = lastCheckOut.getHours() * 60 + lastCheckOut.getMinutes();

        if (actualEndMinutes > scheduledEndMinutes) {
            overtimeMinutes += (actualEndMinutes - scheduledEndMinutes);
        }
    }

    return overtimeMinutes;
}

/**
 * Calcula horas normais trabalhadas (sem horas extra)
 */
export function calculateRegularHours(workno: string): number {
    const schedule = getEmployeeSchedule(workno);
    const { startTime, endTime } = schedule;

    const startMinutes = startTime.hour * 60 + startTime.minute;
    const endMinutes = endTime.hour * 60 + endTime.minute;

    return endMinutes - startMinutes; // Retorna minutos do dia normal de trabalho
}

/**
 * Obtém informação formatada do horário
 */
export function getScheduleInfo(workno: string): {
    scheduleName: string;
    startTimeStr: string;
    endTimeStr: string;
    regularHours: string;
} {
    const schedule = getEmployeeSchedule(workno);
    const regularMinutes = calculateRegularHours(workno);
    const regularHours = Math.floor(regularMinutes / 60);
    const regularMins = regularMinutes % 60;

    return {
        scheduleName: schedule.name,
        startTimeStr: `${schedule.startTime.hour.toString().padStart(2, '0')}:${schedule.startTime.minute.toString().padStart(2, '0')}`,
        endTimeStr: `${schedule.endTime.hour.toString().padStart(2, '0')}:${schedule.endTime.minute.toString().padStart(2, '0')}`,
        regularHours: `${regularHours}h${regularMins > 0 ? ` ${regularMins}m` : ''}`
    };
}
