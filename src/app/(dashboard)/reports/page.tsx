"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { addDays, format, parseISO, startOfMonth, endOfMonth, subMonths, endOfDay, startOfDay } from "date-fns"
import { pt } from "date-fns/locale"
import { Calendar as CalendarIcon, FileDown, Search, RefreshCw, Clock, User, Users, Filter, ChevronDown, CalendarOff } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { exportToPDF, exportToExcel, exportToMensalPDF } from "@/lib/exports"
import { getAttendanceRecords, getEmployees as fetchAllEmployeesApi } from "@/lib/api"
import { calculateSmartWorkHours, getFormattedScheduleInfo } from "@/lib/schedules"
import { ExportModal } from "@/components/reports/ExportModal"

type AttendanceRecord = {
    uuid: string
    employeeName: string
    employeeId: string
    checktime: string
    checktype: number
    deviceName: string
    deviceSerial: string
}

type Employee = {
    id: string
    name: string
    recordCount: number
}

// Mapeamento dos tipos de check
const CHECK_TYPES: Record<number, { label: string; color: string }> = {
    0: { label: "Check-In", color: "bg-green-100 text-green-700 border-green-300" },
    1: { label: "Check-Out", color: "bg-red-100 text-red-700 border-red-300" },
    2: { label: "Break Start", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    3: { label: "Break End", color: "bg-blue-100 text-blue-700 border-blue-300" },
    128: { label: "Overtime In", color: "bg-orange-100 text-orange-700 border-orange-300" },
    129: { label: "Overtime Out", color: "bg-purple-100 text-purple-700 border-purple-300" },
}

function getCheckTypeInfo(type: number) {
    return CHECK_TYPES[type] || { label: `Tipo ${type}`, color: "bg-gray-100 text-gray-700 border-gray-300" };
}

// Períodos pré-definidos
const PRESET_PERIODS = [
    { label: "Últimos 7 dias", value: "7d", getDates: () => ({ from: addDays(new Date(), -7), to: endOfDay(new Date()) }) },
    { label: "Últimos 30 dias", value: "30d", getDates: () => ({ from: addDays(new Date(), -30), to: endOfDay(new Date()) }) },
    { label: "Este mês", value: "thisMonth", getDates: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
    { label: "Mês passado", value: "lastMonth", getDates: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "Últimos 3 meses", value: "3m", getDates: () => ({ from: addDays(new Date(), -90), to: endOfDay(new Date()) }) },
    { label: "Últimos 6 meses", value: "6m", getDates: () => ({ from: addDays(new Date(), -180), to: endOfDay(new Date()) }) },
    { label: "Este ano", value: "thisYear", getDates: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: endOfDay(new Date()) }) },
    { label: "Mês Específico...", value: "specificMonth", getDates: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
]

export default function ReportsPage() {
    const { data: session } = useSession()
    const [date, setDate] = React.useState<DateRange | undefined>({
        from: addDays(new Date(), -30),
        to: endOfDay(new Date()),
    })
    const [records, setRecords] = React.useState<AttendanceRecord[]>([])
    const [allEmployees, setAllEmployees] = React.useState<Employee[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [selectedEmployee, setSelectedEmployee] = React.useState<string>("all")
    const [selectedPeriod, setSelectedPeriod] = React.useState<string>("30d")
    const [activeTab, setActiveTab] = React.useState<string>("summary")
    const [rateLimitCountdown, setRateLimitCountdown] = React.useState<number>(0)
    const [reportHeader, setReportHeader] = React.useState<string | undefined>(undefined)
    const [logoUrl, setLogoUrl] = React.useState<string | undefined>(undefined)
    const [schedulesMap, setSchedulesMap] = React.useState<Map<string, any>>(new Map())
    const [isExportModalOpen, setIsExportModalOpen] = React.useState(false)
    const [reportType, setReportType] = React.useState<"summary" | "detailed" | "matrix">("summary")
    const [managedWorknos, setManagedWorknos] = React.useState<string[]>([])

    // Fetch user profile for settings
    React.useEffect(() => {
        fetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.reportHeader) setReportHeader(data.reportHeader);
                if (data.logoUrl) setLogoUrl(data.logoUrl);
            })
            .catch(err => console.error("Error fetching profile", err));

        // Fetch schedules mapping and managed worknos
        Promise.all([
            fetch('/api/schedules').then(res => res.json()),
            fetch('/api/employees').then(res => res.json())
        ]).then(([schedulesData, employeesData]) => {
            const map = new Map();
            schedulesData.forEach((sched: any) => {
                sched.employeeSchedules?.forEach((es: any) => {
                    map.set(es.workno, sched);
                });
            });
            setSchedulesMap(map);
            setManagedWorknos(employeesData.worknos || []);
        }).catch(err => console.error("Error fetching initial data", err));
    }, []);

    // Employee list is populated from records fetched manually by the user
    // (No auto-fetch on load to avoid CrossChex API rate limit FREQUENT_REQUEST errors)

    // Contador de rate limit
    React.useEffect(() => {
        if (rateLimitCountdown <= 0) return;

        const timer = setInterval(() => {
            setRateLimitCountdown(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [rateLimitCountdown]);

    // Juntar a lista mestre de colaboradores com os dados dos registos atuais
    const employees = React.useMemo<Employee[]>(() => {
        const empMap = new Map<string, Employee>(allEmployees.map(e => [e.id, { ...e, recordCount: 0 }]))

        records.forEach((r: AttendanceRecord) => {
            if (!empMap.has(r.employeeId)) {
                empMap.set(r.employeeId, { id: r.employeeId, name: r.employeeName, recordCount: 0 })
            }
            empMap.get(r.employeeId)!.recordCount++
        })

        return Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [records, allEmployees])

    const fetchRecords = React.useCallback(async () => {
        if (!date?.from || !date?.to) return;

        setLoading(true);
        setError(null);

        try {
            const beginTime = date.from.toISOString().replace('Z', '+00:00');
            const endTime = date.to.toISOString().replace('Z', '+00:00');

            const response = await getAttendanceRecords(beginTime, endTime);

            const allFetchedRecords: AttendanceRecord[] = response.payload.list.map(item => ({
                uuid: item.uuid,
                employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
                employeeId: item.employee.workno,
                checktime: item.checktime,
                checktype: item.checktype,
                deviceName: item.device.name,
                deviceSerial: item.device.serial_number
            }));

            // Filter by managed worknos if list is available
            const filteredByManaged = managedWorknos.length > 0 
                ? allFetchedRecords.filter(r => managedWorknos.includes(r.employeeId))
                : allFetchedRecords;

            setRecords(filteredByManaged);
        } catch (err: any) {
            if (err.message && err.message.includes("Limite da API CrossChex")) {
                setRateLimitCountdown(30);
            }
            setError(err.message || 'Erro ao carregar registos');
            console.error('Error fetching records:', err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    // Auto-fetch removed — triggered manually via 'Atualizar' button
    // to avoid CrossChex FREQUENT_REQUEST rate limit errors on page load

    // Filtrar registos pelo colaborador selecionado e excluir Julio (ID 8) para VP
    const filteredRecords = React.useMemo(() => {
        const company = session?.user?.company?.toLowerCase() || "";
        const isVP = company.includes("vila peixoto") || company.includes("vp");
        
        let filtered = records;
        if (isVP) {
            filtered = filtered.filter(r => String(r.employeeId) !== '8');
        }
        
        if (selectedEmployee === "all") return filtered;
        return filtered.filter(r => r.employeeId === selectedEmployee);
    }, [records, selectedEmployee, session]);

    // Agrupar registos por data e funcionário e calcular horas reais
    const dailySummaries = React.useMemo(() => {
        const groups: Record<string, AttendanceRecord[]> = {};

        filteredRecords.forEach((record: AttendanceRecord) => {
            const dateKey = format(parseISO(record.checktime), 'yyyy-MM-dd');
            const groupKey = `${dateKey}_${record.employeeId}`;
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(record);
        });

        const summaries = Object.values(groups).map(group => {
            const sorted = [...group].sort((a, b) =>
                parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime()
            );

            const first = sorted[0];
            const last = sorted[sorted.length - 1];

            const { totalWorkMs, overtimeHours } = calculateSmartWorkHours(
                sorted.map(r => ({ time: r.checktime, type: r.checktype })),
                session?.user?.company || ""
            );

            const hours = Math.floor(totalWorkMs / (1000 * 60 * 60));
            const minutes = Math.floor((totalWorkMs % (1000 * 60 * 60)) / (1000 * 60));
            const durationStr = totalWorkMs > 0 ? `${hours}h ${minutes}m` : "-";

            const overtimeMs = overtimeHours * 60 * 60 * 1000;
            const otHours = Math.floor(overtimeMs / (1000 * 60 * 60));
            const otMinutes = Math.floor((overtimeMs % (1000 * 60 * 60)) / (1000 * 60));
            const overtimeStr = overtimeMs > 0 ? `+${otHours}h ${otMinutes}m` : "-";

            const lastRecord = sorted[sorted.length - 1];
            const isLastEntry = lastRecord.checktype === 0 || lastRecord.checktype === 128 || lastRecord.checktype === 3;
            const lastOutTime = !isLastEntry ? last.checktime : null;

            return {
                id: `${first.employeeId}_${first.checktime}`,
                date: format(parseISO(first.checktime), 'yyyy-MM-dd'),
                employeeId: first.employeeId,
                employeeName: first.employeeName,
                department: (first as any).department || "Geral",
                firstIn: first.checktime,
                lastOut: lastOutTime,
                duration: durationStr,
                durationMs: totalWorkMs,
                overtime: overtimeStr,
                overtimeMs: overtimeMs,
                recordCount: group.length,
                allRecords: sorted,
                isPlaceholder: false,
                isLate: false,
                isEarly: false
            };
        });

        // Mapping for late/early detection
        const summariesWithWarnings = summaries.map(s => {
            if (s.isPlaceholder) return s;
            
            const sched = schedulesMap.get(s.employeeId);
            if (!sched) return s;

            // Late Detection
            const firstInTime = format(parseISO(s.firstIn), 'HH:mm');
            const [inH, inM] = firstInTime.split(':').map(Number);
            const [startH, startM] = sched.startTime.split(':').map(Number);
            const tolerance = sched.lateTolerance || 0;
            
            const inTotalMin = inH * 60 + inM;
            const startTotalMin = startH * 60 + startM;
            const isLate = inTotalMin > (startTotalMin + tolerance);

            // Early Departure Detection
            let isEarly = false;
            if (s.lastOut) {
                const lastOutTime = format(parseISO(s.lastOut), 'HH:mm');
                const [outH, outM] = lastOutTime.split(':').map(Number);
                const [endH, endM] = sched.endTime.split(':').map(Number);
                const outTotalMin = outH * 60 + outM;
                const endTotalMin = endH * 60 + endM;
                isEarly = outTotalMin < endTotalMin;
            }

            return { ...s, isLate, isEarly };
        });

        // If single employee, inject absences
        if (selectedEmployee !== "all" && date?.from && date?.to && employees.length > 0) {
            const empName = employees.find(e => e.id === selectedEmployee)?.name || "Colaborador";
            const existingDates = new Set(summariesWithWarnings.map(s => s.date));
            let current = startOfDay(date.from);
            const last = startOfDay(date.to);
            
            while (current <= last) {
                const dateKey = format(current, 'yyyy-MM-dd');
                const day = current.getDay();
                const isWeekend = day === 0 || day === 6;

                if (!isWeekend && !existingDates.has(dateKey)) {
                    summariesWithWarnings.push({
                        id: `absent_${selectedEmployee}_${dateKey}`,
                        date: dateKey,
                        employeeId: selectedEmployee,
                        employeeName: empName,
                        department: "-",
                        firstIn: current.toISOString(),
                        lastOut: null,
                        duration: "Falta",
                        durationMs: 0,
                        overtime: "-",
                        overtimeMs: 0,
                        recordCount: 0,
                        allRecords: [],
                        isPlaceholder: true,
                        isLate: false,
                        isEarly: false
                    });
                }
                current = addDays(current, 1);
            }
        }

        return summariesWithWarnings.sort((a, b) => {
            const nameCompare = a.employeeName.localeCompare(b.employeeName);
            if (nameCompare !== 0) return nameCompare;
            return b.date.localeCompare(a.date);
        });
    }, [filteredRecords, selectedEmployee, date, employees, schedulesMap]);

    // Estatísticas do colaborador selecionado
    const stats = React.useMemo(() => {
        const uniqueEmployees = selectedEmployee === "all"
            ? new Set(filteredRecords.map(r => r.employeeId)).size
            : 1;
        const totalDaysWork = new Set(dailySummaries.map(s => s.date)).size;

        const totalWorkMs = dailySummaries.reduce((acc, s) => acc + s.durationMs, 0);
        const workHours = Math.floor(totalWorkMs / (1000 * 60 * 60));
        const workMinutes = Math.floor((totalWorkMs % (1000 * 60 * 60)) / (1000 * 60));
        const totalWorkStr = `${workHours}h ${workMinutes}m`;

        // Client specific logic
        const company = session?.user?.company?.toLowerCase() || "";
        const isGengibre = company.includes("gengibre") || company.includes("cozinha criativa");
        const isVP = company.includes("vila peixoto") || company.includes("vp");
        const isVE = company.includes("ve") || company.includes("vontade e empenho");
        
        const showOvertime = isGengibre || isVE;
        const isExempt = isGengibre && (selectedEmployee === "18" || selectedEmployee === "11");
        
        const rawOtMs = dailySummaries.reduce((acc, s) => acc + s.overtimeMs, 0);
        const { getClientRules } = require("@/lib/schedules");
        const rules = getClientRules(company);
        const EXEMPTION_MS = 20 * 60 * 60 * 1000;
        
        // Use exempt IDs from rules
        const rulesExemptIds = rules?.exemptIds || [];
        const isEmployeeExempt = rulesExemptIds.includes(selectedEmployee);
        const totalOtMs = isEmployeeExempt ? Math.max(0, rawOtMs - EXEMPTION_MS) : rawOtMs;
        
        const otHours = Math.floor(totalOtMs / (1000 * 60 * 60));
        const otMinutes = Math.floor((totalOtMs % (1000 * 60 * 60)) / (1000 * 60));
        const totalOvertimeStr = showOvertime ? `${otHours}h ${otMinutes}m` : "-";

        const avgHoursPerDay = totalDaysWork > 0
            ? (totalWorkMs / totalDaysWork / (1000 * 60 * 60)).toFixed(1)
            : "0";

        // Absence calculation (only logic for single employee for now)
        let totalAbsences = 0;
        if (selectedEmployee !== "all" && date?.from && date?.to) {
            let current = startOfDay(date.from);
            const last = startOfDay(date.to);
            const workDaysWithRecords = new Set(dailySummaries.filter(s => !s.isPlaceholder).map(s => s.date));
            
            while (current <= last) {
                const day = current.getDay();
                const isWeekend = day === 0 || day === 6;
                const dateKey = format(current, 'yyyy-MM-dd');
                
                if (!isWeekend && !workDaysWithRecords.has(dateKey)) {
                    totalAbsences++;
                }
                current = addDays(current, 1);
            }
        }

        // Late arrivals calculation
        const totalLate = dailySummaries.filter(s => s.isLate).length;
        const totalEarlyExits = dailySummaries.filter(s => s.isEarly).length;

        return {
            totalDaysWork,
            totalWorkStr,
            totalOvertimeStr,
            avgHoursPerDay,
            uniqueEmployees,
            totalAbsences,
            totalLate,
            totalEarlyExits,
            isGengibre,
            showOvertime
        };
    }, [dailySummaries, filteredRecords, selectedEmployee, date, session]);

    // Histórico detalhado de todas as picagens
    const detailedHistory = React.useMemo(() => {
        return [...filteredRecords].sort((a, b) => {
            const nameCompare = a.employeeName.localeCompare(b.employeeName);
            if (nameCompare !== 0) return nameCompare;
            return parseISO(b.checktime).getTime() - parseISO(a.checktime).getTime();
        });
    }, [filteredRecords]);

    const handlePeriodChange = (value: string) => {
        setSelectedPeriod(value);
        const preset = PRESET_PERIODS.find(p => p.value === value);
        if (preset) {
            setDate(preset.getDates());
        }
    }

    const handleExport = async (type: "summary" | "detailed" | "matrix" | "mensal", fileFormat: "pdf" | "excel") => {
        setLoading(true);
        try {
            const employeeName = selectedEmployee === "all"
                ? "Todos"
                : employees.find(e => e.id === selectedEmployee)?.name || "Colaborador";

            const periodName = selectedPeriod === "custom" 
                ? `${format(date?.from || new Date(), "dd/MM")} a ${format(date?.to || new Date(), "dd/MM/yy")}`
                : PRESET_PERIODS.find(p => p.value === selectedPeriod)?.label || "Período";

            if (fileFormat === "pdf") {
                if (type === "mensal") {
                    const dataToExport = dailySummaries.map(s => ({
                        funcionario: s.employeeName,
                        departamento: (s as any).department || "-",
                        duracao: s.duration,
                        horasExtra: s.overtime,
                        isLate: s.isLate
                    }));
                    await exportToMensalPDF(
                        dataToExport,
                        `${employeeName} - ${periodName}`,
                        reportHeader,
                        logoUrl
                    );
                } else {
                    const dataToExport = dailySummaries.map(s => ({
                        data: format(parseISO(s.firstIn), 'dd/MM/yyyy', { locale: pt }),
                        funcionario: s.employeeName,
                        id: s.employeeId,
                        departamento: (s as any).department || "-",
                        entrada: format(parseISO(s.firstIn), 'HH:mm'),
                        saida: s.lastOut ? format(parseISO(s.lastOut), 'HH:mm') : '-',
                        movimentos: s.allRecords.map((r: AttendanceRecord) => format(parseISO(r.checktime), 'HH:mm')).join(', '),
                        duracao: s.duration,
                        horasExtra: s.overtime
                    }));
                    
                    await exportToPDF(
                        dataToExport, 
                        `${employeeName} - ${periodName}`, 
                        reportHeader,
                        type,
                        logoUrl
                    );
                }
            } else {
                const dataToExport = dailySummaries.map(s => ({
                    data: format(parseISO(s.firstIn), 'dd/MM/yyyy', { locale: pt }),
                    funcionario: s.employeeName,
                    id_funcionario: s.employeeId,
                    departamento: (s as any).department || "-",
                    entrada: format(parseISO(s.firstIn), 'HH:mm'),
                    saida: s.lastOut ? format(parseISO(s.lastOut), 'HH:mm') : '-',
                    movimentos: s.allRecords.map((r: AttendanceRecord) => format(parseISO(r.checktime), 'HH:mm')).join(', '),
                    duracao_total: s.duration,
                    horas_extra: s.overtime,
                    registos_no_dia: s.recordCount
                }));
                exportToExcel(dataToExport);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = () => setIsExportModalOpen(true);
    const handleExportExcel = () => setIsExportModalOpen(true);

    const selectedEmployeeName = selectedEmployee === "all"
        ? "Todos os Colaboradores"
        : employees.find(e => e.id === selectedEmployee)?.name || "Colaborador";

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                        Relatórios de Assiduidade
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Selecione um colaborador e período para gerar relatórios detalhados
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="default"
                        className="shadow-md bg-blue-600 hover:bg-blue-700"
                        onClick={() => setIsExportModalOpen(true)}
                        disabled={loading || dailySummaries.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar Relatório
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <Card className="border-none shadow-sm overflow-visible bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row items-end gap-4">
                        {/* Seletor de Colaborador */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Colaborador
                            </label>
                            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecionar colaborador" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        <div className="flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            Todos os Colaboradores
                                        </div>
                                    </SelectItem>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            <div className="flex items-center justify-between gap-4">
                                                <span>{emp.name}</span>
                                                <Badge variant="secondary" className="text-xs">
                                                    {emp.recordCount} reg.
                                                </Badge>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Período Pré-definido */}
                        <div className="flex-1 space-y-2 min-w-[200px]">
                            <label className="text-sm font-medium text-neutral-500">
                                Período
                            </label>
                            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                                <SelectTrigger className="w-full bg-neutral-50 dark:bg-neutral-800 border-neutral-200">
                                    <SelectValue placeholder="Selecionar período" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PRESET_PERIODS.map(period => (
                                        <SelectItem key={period.value} value={period.value}>
                                            {period.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Datas Personalizadas */}
                        <div className="flex-1 space-y-2 min-w-[220px]">
                            <label className="text-sm font-medium text-neutral-500">
                                Datas Selecionadas
                            </label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-neutral-50 dark:bg-neutral-800 border-neutral-200",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date?.from ? (
                                            date.to ? (
                                                <>
                                                    {format(date.from, "dd MMM", { locale: pt })} -{" "}
                                                    {format(date.to, "dd MMM yyyy", { locale: pt })}
                                                </>
                                            ) : (
                                                format(date.from, "dd MMM yyyy", { locale: pt })
                                            )
                                        ) : (
                                            <span>Selecione as datas</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={date?.from}
                                        selected={date}
                                        onSelect={(newDate) => {
                                            setDate(newDate);
                                            setSelectedPeriod("custom");
                                        }}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex items-end h-full">
                            <Button 
                                onClick={fetchRecords} 
                                disabled={loading || rateLimitCountdown > 0}
                                className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800 h-10 px-6"
                            >
                                {rateLimitCountdown > 0 ? (
                                    <Clock className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                    <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                                )}
                                {rateLimitCountdown > 0 ? `Aguarde ${rateLimitCountdown}s` : "Atualizar"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Estatísticas do Colaborador */}
            <div className="grid gap-4 md:grid-cols-5">
                {/* Colaboradores / Ausências */}
                <Card className="border-none shadow-sm bg-white dark:bg-neutral-900">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                            {selectedEmployee === "all" ? <Users className="h-3 w-3" /> : <CalendarOff className="h-3 w-3" />}
                            {selectedEmployee === "all" ? "Colaboradores Ativos" : "Dias Ausente"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            selectedEmployee !== "all" && stats.totalAbsences > 0 ? "text-red-600" : "text-neutral-900 dark:text-neutral-100"
                        )}>
                            {selectedEmployee === "all" ? stats.uniqueEmployees : stats.totalAbsences}
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-1">
                            {selectedEmployee === "all" ? "Com registos no período" : "Dias úteis sem registos"}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Colaborador
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate" title={selectedEmployeeName}>
                            {selectedEmployeeName}
                        </div>
                    </CardContent>
                </Card>

                {/* Atrasos */}
                <Card className="border-none shadow-sm bg-white dark:bg-neutral-900">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            Atrasos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            stats.totalLate > 0 ? "text-red-600" : "text-neutral-900 dark:text-neutral-100"
                        )}>
                            {stats.totalLate}
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-1">
                            Entradas fora do horário
                        </p>
                    </CardContent>
                </Card>
                {/* Saídas Antecipadas */}
                <Card className="border-none shadow-sm bg-white dark:bg-neutral-900">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            Saídas Antecipadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            stats.totalEarlyExits > 0 ? "text-yellow-600" : "text-neutral-900 dark:text-neutral-100"
                        )}>
                            {stats.totalEarlyExits}
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-1">
                            Saídas antes do horário
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            Dias Trabalhados
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalDaysWork}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Total Horas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalWorkStr}</div>
                    </CardContent>
                </Card>
                {stats.showOvertime && (
                    <Card className="border-none shadow-sm">
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-orange-600" />
                                Horas Extra
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">{stats.totalOvertimeStr}</div>
                        </CardContent>
                    </Card>
                )}
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-600" />
                            Média/Dia
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{stats.avgHoursPerDay}h</div>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">❌ {error}</p>
                </div>
            )}

            {/* Tabs: Resumo Diário vs Histórico Completo */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="summary">Resumo Diário</TabsTrigger>
                    <TabsTrigger value="history">Histórico Picagens</TabsTrigger>
                </TabsList>

                {/* Tab: Resumo Diário */}
                <TabsContent value="summary">
                    <Card className="border-none shadow-sm">
                        <CardHeader>
                            <CardTitle>Resumo Diário de Ponto</CardTitle>
                            <CardDescription>
                                {stats.totalDaysWork} dias com atividade registada
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-50">
                                            <TableHead className="w-[120px]">Data</TableHead>
                                            <TableHead>Funcionário</TableHead>
                                            <TableHead className="text-center">Entrada</TableHead>
                                            <TableHead className="text-center">Saída</TableHead>
                                            <TableHead className="text-center">Movimentos (24h)</TableHead>
                                            <TableHead className="text-center">Duração</TableHead>
                                            {stats.showOvertime && <TableHead className="text-center">Horas Extra</TableHead>}
                                            <TableHead className="text-right">Registos</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-neutral-500">
                                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                                    A carregar relatórios...
                                                </TableCell>
                                            </TableRow>
                                        ) : selectedEmployee === "all" && dailySummaries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-12 text-neutral-500">
                                                    <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                                    <p className="font-medium text-neutral-600 dark:text-neutral-400">Selecione um colaborador</p>
                                                    <p className="text-xs text-neutral-400 mt-1">Escolha um colaborador no filtro acima e clique em &quot;Atualizar&quot; para ver o resumo diário</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : dailySummaries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-neutral-500">
                                                    Sem atividade no período selecionado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dailySummaries.map((summary) => {
                                                const hasOvertime = summary.overtimeMs > 0;
                                                return (
                                                    <TableRow 
                                                        key={summary.id}
                                                        className={cn(
                                                            summary.isPlaceholder && "bg-red-50/50 dark:bg-red-950/10"
                                                        )}
                                                    >
                                                        <TableCell className="font-medium">
                                                            {format(parseISO(summary.firstIn), 'dd MMM yyyy', { locale: pt })}
                                                            <div className="text-[10px] text-neutral-400 md:hidden">{summary.employeeName}</div>
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell">
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-neutral-900 dark:text-neutral-100">{summary.employeeName}</span>
                                                                <span className="text-xs text-neutral-500">ID: {summary.employeeId}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                                                {format(parseISO(summary.firstIn), 'HH:mm')}
                                                            </div>
                                                            {summary.isLate && (
                                                                <div className="w-2 h-2 rounded-full bg-red-500 inline-block ml-1" title="Atraso" />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {summary.lastOut ? (
                                                                <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                                                    {format(parseISO(summary.lastOut), 'HH:mm')}
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] text-neutral-400 italic">Sem saída</span>
                                                            )}
                                                            {summary.isEarly && (
                                                                <div className="w-2 h-2 rounded-full bg-yellow-500 inline-block ml-1" title="Saída Antecipada" />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="flex flex-wrap gap-1 justify-center max-w-[180px] mx-auto">
                                                                {summary.allRecords.map((r: AttendanceRecord, i: number) => {
                                                                    const info = getCheckTypeInfo(r.checktype);
                                                                    return (
                                                                        <Badge key={i} variant="outline" className={cn("text-[9px] px-1 py-0 h-4 min-w-[32px] justify-center", info.color)} title={info.label}>
                                                                            {format(parseISO(r.checktime), 'HH:mm')}
                                                                        </Badge>
                                                                    )
                                                                })}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                                                                {summary.duration}
                                                            </span>
                                                        </TableCell>
                                                        {stats.showOvertime && (
                                                            <TableCell className="text-center">
                                                                {hasOvertime ? (
                                                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-bold">
                                                                        {summary.overtime}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-neutral-300">-</span>
                                                                )}
                                                            </TableCell>
                                                        )}
                                                        <TableCell className="text-right">
                                                            <Badge variant="secondary" className="font-mono text-[10px]">
                                                                {summary.recordCount} logs
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Histórico Completo de Picagens */}
                <TabsContent value="history">
                    <Card className="border-none shadow-sm">
                        <CardHeader>
                            <CardTitle>Histórico Completo de Picagens</CardTitle>
                            <CardDescription>
                                {detailedHistory.length} registos de ponto no período
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-hidden max-h-[600px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                                        <TableRow className="hover:bg-neutral-50">
                                            <TableHead className="w-[180px]">Data/Hora</TableHead>
                                            <TableHead>Funcionário</TableHead>
                                            <TableHead className="text-center">Tipo</TableHead>
                                            <TableHead>Dispositivo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-neutral-500">
                                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                                    A carregar histórico...
                                                </TableCell>
                                            </TableRow>
                                        ) : detailedHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-neutral-500">
                                                    Sem registos no período selecionado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            detailedHistory.map((record) => {
                                                const checkInfo = getCheckTypeInfo(record.checktype);
                                                return (
                                                    <TableRow key={record.uuid}>
                                                        <TableCell className="font-mono text-sm">
                                                            {format(parseISO(record.checktime), 'dd/MM/yyyy HH:mm:ss', { locale: pt })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold">{record.employeeName}</span>
                                                                <span className="text-xs text-neutral-500">ID: {record.employeeId}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="outline" className={cn("text-xs", checkInfo.color)}>
                                                                {checkInfo.label}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm">{record.deviceName}</span>
                                                                <span className="text-xs text-neutral-500">{record.deviceSerial}</span>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <ExportModal
                isOpen={isExportModalOpen}
                onOpenChange={setIsExportModalOpen}
                onExport={handleExport}
                loading={loading}
                title={selectedEmployeeName}
            />
        </div>
    )
}
