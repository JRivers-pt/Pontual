import { format, parseISO, eachDayOfInterval, isWeekend } from "date-fns";

export interface PunchRecord {
    checktime: string; // ISO string or "YYYY-MM-DD HH:mm:ss"
    checktype?: number;
}

export interface EmployeeData {
    id: string;
    name: string;
    records: PunchRecord[];
}

export interface ProcessedDay {
    date: Date;
    dateStr: string; // "DD/MM/YYYY"
    isWeekend: boolean;
    entrada: string;
    almoco: string;
    saida: string;
    durationMinutes: number;
    durationStr: string;
    extraMinutes: number;
    extraStr: string;
    obs: string;
}

export interface EmployeeReportResult {
    id: string;
    name: string;
    days: ProcessedDay[];
    totalWorkMinutes: number;
    totalWorkStr: string;
    totalOtMinutes: number;
    totalOtStr: string;
    isExempt: boolean;
    exemptionMinutes: number;
    payableOtMinutes: number;
    payableOtStr: string;
}

export interface ClientReportRules {
    exemptIds: string[]; // e.g. ["11", "18"]
    skipIds: string[];   // e.g. ["15"] (admin)
    overtimeToleranceMinutes: number; // default 5 min -> triggers at 486 min
    normalDayMinutes: number; // default 480 min (8h)
    lunchAutoDeductMinutes: number; // default 60 min (1h)
    lunchThresholdMinutes: number; // default 360 min (6h)
}

export function formatMinutesToHms(minutes: number): string {
    if (minutes <= 0) return "-";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m.toString().padStart(2, "0")}m`;
}

function timeStringToMinutes(timeStr: string): number {
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return 0;
}

export function processEmployeeAttendance(
    emp: EmployeeData,
    startDate: Date,
    endDate: Date,
    rules: ClientReportRules
): EmployeeReportResult {
    const isExempt = rules.exemptIds.includes(String(emp.id).trim());
    const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });

    // Group punches by day (YYYY-MM-DD)
    const dayPunchesMap = new Map<string, string[]>();
    for (const r of emp.records) {
        // Handle timezone/date string
        let dt: Date;
        if (r.checktime.includes("T")) {
            dt = parseISO(r.checktime);
        } else {
            dt = new Date(r.checktime.replace(" ", "T"));
        }
        
        const dateKey = format(dt, "yyyy-MM-dd");
        const timeStr = format(dt, "HH:mm");

        if (!dayPunchesMap.has(dateKey)) {
            dayPunchesMap.set(dateKey, []);
        }
        const punchesList = dayPunchesMap.get(dateKey)!;
        if (!punchesList.includes(timeStr)) {
            punchesList.push(timeStr);
        }
    }

    let totalWorkMinutes = 0;
    let totalOtMinutes = 0;
    const processedDays: ProcessedDay[] = [];

    for (const day of daysInterval) {
        const dateKey = format(day, "yyyy-MM-dd");
        const isWk = isWeekend(day);
        const rawPunches = (dayPunchesMap.get(dateKey) || []).sort((a, b) => 
            timeStringToMinutes(a) - timeStringToMinutes(b)
        );

        let entrada = "-";
        let s1 = "-";
        let e2 = "-";
        let saida = "-";
        let durationMinutes = 0;
        let extraMinutes = 0;
        let obsParts: string[] = [];

        // 1. Double punch filter (< 15 mins)
        const validPunches: string[] = [];
        for (const p of rawPunches) {
            if (validPunches.length === 0) {
                validPunches.push(p);
            } else {
                const prevMin = timeStringToMinutes(validPunches[validPunches.length - 1]);
                const currMin = timeStringToMinutes(p);
                if (currMin - prevMin >= 15) {
                    validPunches.push(p);
                } else {
                    if (!obsParts.includes("Dupla Picagem")) {
                        obsParts.push("Dupla Picagem");
                    }
                }
            }
        }

        const pc = validPunches.length;
        if (pc >= 4) {
            entrada = validPunches[0];
            s1 = validPunches[1];
            e2 = validPunches[2];
            saida = validPunches[validPunches.length - 1];
            durationMinutes = (timeStringToMinutes(s1) - timeStringToMinutes(entrada)) +
                              (timeStringToMinutes(saida) - timeStringToMinutes(e2));
        } else if (pc === 3) {
            entrada = validPunches[0];
            s1 = validPunches[1];
            e2 = validPunches[2];
            durationMinutes = timeStringToMinutes(s1) - timeStringToMinutes(entrada);
            obsParts.push("Falta picagem (Almoço)");
        } else if (pc === 2) {
            entrada = validPunches[0];
            saida = validPunches[1];
            durationMinutes = timeStringToMinutes(saida) - timeStringToMinutes(entrada);
            if (durationMinutes > rules.lunchThresholdMinutes) {
                durationMinutes -= rules.lunchAutoDeductMinutes;
                obsParts.push("Falta break de almoço / Dedução 1h");
            }
        } else if (pc === 1) {
            const pMin = timeStringToMinutes(validPunches[0]);
            if (pMin < 780) { // before 13:00
                entrada = validPunches[0];
                obsParts.push("Falta saída");
            } else {
                saida = validPunches[0];
                obsParts.push("Falta entrada");
            }
        }

        if (durationMinutes > 0) {
            totalWorkMinutes += durationMinutes;
            // Overtime: standard 8h (480m) cap, 5m tolerance (trigger >= 486m)
            if (durationMinutes >= rules.normalDayMinutes + rules.overtimeToleranceMinutes + 1) {
                extraMinutes = durationMinutes - (rules.normalDayMinutes + rules.overtimeToleranceMinutes);
                totalOtMinutes += extraMinutes;
            }
        }

        const almoco = (s1 !== "-" || e2 !== "-") ? `${s1} - ${e2}` : "-";

        processedDays.push({
            date: day,
            dateStr: format(day, "dd/MM/yyyy"),
            isWeekend: isWk,
            entrada,
            almoco,
            saida,
            durationMinutes,
            durationStr: formatMinutesToHms(durationMinutes),
            extraMinutes,
            extraStr: extraMinutes > 0 ? `+${formatMinutesToHms(extraMinutes)}` : "-",
            obs: obsParts.join(" / ")
        });
    }

    const exemptionMinutes = 20 * 60; // 20 hours = 1200 minutes
    const payableOtMinutes = isExempt ? Math.max(0, totalOtMinutes - exemptionMinutes) : totalOtMinutes;

    return {
        id: String(emp.id),
        name: emp.name,
        days: processedDays,
        totalWorkMinutes,
        totalWorkStr: formatMinutesToHms(totalWorkMinutes),
        totalOtMinutes,
        totalOtStr: formatMinutesToHms(totalOtMinutes),
        isExempt,
        exemptionMinutes,
        payableOtMinutes,
        payableOtStr: formatMinutesToHms(payableOtMinutes)
    };
}