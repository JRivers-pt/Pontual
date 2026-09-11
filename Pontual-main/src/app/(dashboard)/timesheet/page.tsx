"use client"

import * as React from "react"
import {
    format,
    parseISO,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isWeekend,
    getDay,
    subMonths,
    addMonths,
    startOfDay
} from "date-fns"
import { pt } from "date-fns/locale"
import {
    FileDown,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Calendar,
    Clock,
    User,
    Users,
    Printer,
    AlertCircle,
    Search,
    ArrowLeft,
    CheckCircle2
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useSession } from "next-auth/react"
import { exportToPDF } from "@/lib/exports"
import { getAttendanceRecords, getSchedules, getEmployees } from "@/lib/api"
import { isLate as checkIsLate, calculateOvertime, Schedule, getVilaPeixotoSchedule, getGengibreSchedule } from "@/lib/schedules"

type AttendanceRecord = {
    uuid: string
    employeeName: string
    employeeId: string
    checktime: string
    checktype: number
}

type DayRecord = {
    date: Date
    dateStr: string
    isWeekend: boolean
    in1: string | null
    out1: string | null
    in2: string | null
    out2: string | null
    workedMinutes: number
    overtimeMinutes: number
    status: 'normal' | 'late' | 'absent' | 'weekend' | 'holiday'
}

type Employee = {
    id: string
    name: string
    scheduleCode?: string | null
    scheduleName?: string | null
}

export default function TimesheetPage() {
    const { data: session } = useSession()
    const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date())
    const [records, setRecords] = React.useState<AttendanceRecord[]>([])
    const [schedules, setSchedules] = React.useState<Schedule[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [selectedEmployee, setSelectedEmployee] = React.useState<string>("all")
    const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date())
    const [allEmployees, setAllEmployees] = React.useState<Employee[]>([])
    const [searchQuery, setSearchQuery] = React.useState<string>("")

    const companyName = (session?.user as any)?.company || ""
    const isVilaPeixoto = companyName.toLowerCase().includes("vila peixoto")
    const isGengibre = companyName.toLowerCase().includes("cozinha") ||
        companyName.toLowerCase().includes("gengibre") ||
        companyName.toLowerCase().includes("criativa")

    // Extract unique employees combining master list + records
    const employees = React.useMemo<Employee[]>(() => {
        const empMap = new Map<string, Employee>()

        // Use permanent employees list as base
        allEmployees.forEach(e => empMap.set(e.id, e))

        // Also add any employee found in current records (fallback)
        records.forEach(r => {
            if (!empMap.has(r.employeeId)) {
                empMap.set(r.employeeId, { id: r.employeeId, name: r.employeeName })
            }
        })

        return Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [records, allEmployees])

    // Filter employees by search term
    const filteredEmployeesList = React.useMemo(() => {
        if (!searchQuery.trim()) return employees
        const q = searchQuery.toLowerCase().trim()
        return employees.filter(e =>
            e.name.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q) ||
            (e.scheduleName && e.scheduleName.toLowerCase().includes(q)) ||
            (e.scheduleCode && e.scheduleCode.toLowerCase().includes(q))
        )
    }, [employees, searchQuery])

    const fetchMonthData = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const monthStart = startOfMonth(currentMonth)
            const monthEnd = endOfMonth(currentMonth)
            const now = new Date()

            const isCurrentMonth = format(currentMonth, 'yyyy-MM') === format(now, 'yyyy-MM')
            const adjustedEnd = isCurrentMonth ? now : monthEnd

            const beginTime = monthStart.toISOString().replace('Z', '+00:00')
            const endTime = adjustedEnd.toISOString().replace('Z', '+00:00')

            const [response, schedulesData] = await Promise.all([
                getAttendanceRecords(beginTime, endTime),
                getSchedules()
            ])

            const formattedRecords: AttendanceRecord[] = (response.payload.list || []).map((item: any) => ({
                uuid: item.uuid,
                employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
                employeeId: item.employee.workno,
                checktime: item.checktime,
                checktype: item.checktype,
            }))

            setRecords(formattedRecords)
            setSchedules(schedulesData)
            setLastUpdate(new Date())
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar dados')
            console.error('Error fetching month data:', err)
        } finally {
            setLoading(false)
        }
    }, [currentMonth])

    // On mount: fetch employee master list instantly, then month attendance data
    React.useEffect(() => {
        const init = async () => {
            try {
                const emps = await getEmployees()
                if (emps && emps.length > 0) {
                    setAllEmployees(emps.map((e: any) => ({
                        id: e.workno,
                        name: e.name || e.fullName || `Colaborador ${e.workno}`,
                        scheduleCode: e.scheduleCode,
                        scheduleName: e.scheduleName
                    })))
                }
            } catch (e) {
                console.error("Error fetching master employees:", e)
            }
            await fetchMonthData()
        }
        init()

        // Auto-refresh every 60s
        const interval = setInterval(fetchMonthData, 60 * 1000)
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // When month changes, fetch records for that month
    React.useEffect(() => {
        fetchMonthData()
    }, [fetchMonthData])

    // Helper for flexible workno matching (e.g. 0700 === 700)
    const matchEmpId = React.useCallback((rId: string, sId: string) => {
        if (!rId || !sId) return false
        const a = String(rId).trim()
        const b = String(sId).trim()
        return a === b ||
            a.padStart(4, '0') === b.padStart(4, '0') ||
            a.replace(/^0+/, '') === b.replace(/^0+/, '')
    }, [])

    // Filter records by selected employee
    const filteredRecords = React.useMemo(() => {
        if (selectedEmployee === "all") return records
        return records.filter(r => matchEmpId(r.employeeId, selectedEmployee))
    }, [records, selectedEmployee, matchEmpId])

    // Selected employee schedule object
    const currentEmployeeObj = React.useMemo(() => {
        return employees.find(e => matchEmpId(e.id, selectedEmployee))
    }, [employees, selectedEmployee, matchEmpId])

    const currentEmployeeSchedule = React.useMemo(() => {
        if (!selectedEmployee || selectedEmployee === "all") return undefined
        const employeeName = currentEmployeeObj?.name || ''
        if (isVilaPeixoto) return getVilaPeixotoSchedule(employeeName)
        if (isGengibre) return getGengibreSchedule(employeeName)
        return schedules.find(s => (s as any).employeeSchedules?.some((es: any) => matchEmpId(es.workno, selectedEmployee))) || schedules[0]
    }, [selectedEmployee, currentEmployeeObj, schedules, isVilaPeixoto, isGengibre, matchEmpId])

    // Build daily records for the month for the selected employee with 4 punch slots (In1, Out1, In2, Out2)
    const monthDays = React.useMemo<DayRecord[]>(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(currentMonth)
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

        const employeeSchedule = currentEmployeeSchedule

        return days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayRecords = filteredRecords.filter(r =>
                format(parseISO(r.checktime), 'yyyy-MM-dd') === dateStr
            )

            if (isWeekend(day)) {
                return {
                    date: day,
                    dateStr,
                    isWeekend: true,
                    in1: null,
                    out1: null,
                    in2: null,
                    out2: null,
                    workedMinutes: 0,
                    overtimeMinutes: 0,
                    status: 'weekend' as const
                }
            }

            if (dayRecords.length === 0) {
                return {
                    date: day,
                    dateStr,
                    isWeekend: false,
                    in1: null,
                    out1: null,
                    in2: null,
                    out2: null,
                    workedMinutes: 0,
                    overtimeMinutes: 0,
                    status: 'absent' as const
                }
            }

            const sorted = [...dayRecords].sort((a, b) =>
                parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime()
            )

            const firstCheck = sorted[0]
            const lastCheck = sorted[sorted.length - 1]
            const firstCheckDate = parseISO(firstCheck.checktime)

            let workedMinutes = 0
            let lastInTime: number | null = null

            sorted.forEach(record => {
                const time = parseISO(record.checktime).getTime()
                const isEntry = record.checktype === 0 || record.checktype === 128 || record.checktype === 3 || record.checktype === 1
                const isExit = record.checktype === 2 || record.checktype === 129

                if (isEntry && lastInTime === null) {
                    lastInTime = time
                } else if (isExit && lastInTime !== null) {
                    workedMinutes += (time - lastInTime) / (1000 * 60)
                    lastInTime = null
                }
            })

            const isPastDay = day < startOfDay(new Date())
            let autoCheckout = false
            if (lastInTime !== null && isPastDay && employeeSchedule) {
                const endTime = typeof employeeSchedule.endTime === 'string'
                    ? (() => { const [h, m] = (employeeSchedule.endTime as string).split(':').map(Number); return { hour: h, minute: m } })()
                    : employeeSchedule.endTime as { hour: number; minute: number }
                const estimatedOut = new Date(day)
                estimatedOut.setHours(endTime.hour, endTime.minute, 0, 0)
                const estimatedMs = estimatedOut.getTime()
                if (estimatedMs > lastInTime) {
                    workedMinutes += (estimatedMs - lastInTime) / (1000 * 60)
                    lastInTime = null
                    autoCheckout = true
                }
            }

            // Map punches into 4 movement slots: In1, Out1, In2, Out2
            let in1: string | null = null
            let out1: string | null = null
            let in2: string | null = null
            let out2: string | null = null

            if (sorted.length === 1) {
                in1 = sorted[0].checktime
                if (autoCheckout) out2 = 'auto'
            } else if (sorted.length === 2) {
                in1 = sorted[0].checktime
                out2 = sorted[1].checktime
            } else if (sorted.length === 3) {
                in1 = sorted[0].checktime
                out1 = sorted[1].checktime
                in2 = sorted[2].checktime
                if (autoCheckout) out2 = 'auto'
            } else if (sorted.length >= 4) {
                in1 = sorted[0].checktime
                out1 = sorted[1].checktime
                in2 = sorted[2].checktime
                out2 = sorted[sorted.length - 1].checktime
            }

            // If workedMinutes was calculated as full day without breaks and we have lunchDuration
            if (sorted.length === 2 && employeeSchedule?.lunchDuration && workedMinutes > 240) {
                workedMinutes = Math.max(0, workedMinutes - employeeSchedule.lunchDuration)
            }

            workedMinutes = Math.round(workedMinutes)
            const lastCheckDate = sorted.length > 1 && lastInTime === null ? parseISO(lastCheck.checktime) : null
            const overtimeMinutes = calculateOvertime(firstCheckDate, lastCheckDate, employeeSchedule)
            const isLate = checkIsLate(firstCheckDate, employeeSchedule)

            return {
                date: day,
                dateStr,
                isWeekend: false,
                in1,
                out1,
                in2,
                out2,
                workedMinutes,
                overtimeMinutes,
                status: (isLate && !employeeSchedule?.warningsDisabled) ? 'late' as const : 'normal' as const
            }
        })
    }, [currentMonth, filteredRecords, currentEmployeeSchedule])

    // Calculate monthly summary
    const calculateFullSummary = (recordsForEmployee: AttendanceRecord[]) => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(currentMonth)
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

        const employeeSchedule = currentEmployeeSchedule

        const daysData = days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const dayRecords = recordsForEmployee.filter(r =>
                format(parseISO(r.checktime), 'yyyy-MM-dd') === dateStr
            )

            if (isWeekend(day)) return { workedMinutes: 0, overtimeMinutes: 0, status: 'weekend' as const }
            if (dayRecords.length === 0) return { workedMinutes: 0, overtimeMinutes: 0, status: 'absent' as const }

            const sorted = [...dayRecords].sort((a, b) => parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime())
            const firstCheck = sorted[0]
            const lastCheck = sorted[sorted.length - 1]
            const firstCheckDate = parseISO(firstCheck.checktime)

            let workedMinutes = 0
            let lastInTime: number | null = null

            sorted.forEach(record => {
                const time = parseISO(record.checktime).getTime()
                const isEntry = record.checktype === 0 || record.checktype === 128 || record.checktype === 3 || record.checktype === 1
                const isExit = record.checktype === 2 || record.checktype === 129
                if (isEntry && lastInTime === null) lastInTime = time
                else if (isExit && lastInTime !== null) {
                    workedMinutes += (time - lastInTime) / (1000 * 60)
                    lastInTime = null
                }
            })

            if (lastInTime !== null && day < startOfDay(new Date()) && employeeSchedule) {
                const endTime = typeof employeeSchedule.endTime === 'string'
                    ? (() => { const [h, m] = (employeeSchedule.endTime as string).split(':').map(Number); return { hour: h, minute: m } })()
                    : employeeSchedule.endTime as { hour: number; minute: number }
                const estimatedOut = new Date(day)
                estimatedOut.setHours(endTime.hour, endTime.minute, 0, 0)
                if (estimatedOut.getTime() > lastInTime) {
                    workedMinutes += (estimatedOut.getTime() - lastInTime) / (1000 * 60)
                    lastInTime = null
                }
            }

            if (sorted.length === 2 && employeeSchedule?.lunchDuration && workedMinutes > 240) {
                workedMinutes = Math.max(0, workedMinutes - employeeSchedule.lunchDuration)
            }

            const lastCheckDate = sorted.length > 1 && lastInTime === null ? parseISO(lastCheck.checktime) : null
            const overtimeMinutes = calculateOvertime(firstCheckDate, lastCheckDate, employeeSchedule)
            const isLate = checkIsLate(firstCheckDate, employeeSchedule)

            return {
                workedMinutes: Math.round(workedMinutes),
                overtimeMinutes,
                status: (isLate && !employeeSchedule?.warningsDisabled) ? 'late' as const : 'normal' as const
            }
        })

        const workDays = daysData.filter((_, i) => !isWeekend(days[i]))
        const presentDays = workDays.filter(d => d.workedMinutes > 0)
        const absentDays = workDays.filter(d => d.status === 'absent')
        const lateDays = workDays.filter(d => d.status === 'late')
        const totalWorkedMinutes = daysData.reduce((acc, d) => acc + d.workedMinutes, 0)
        const totalOvertimeMinutes = daysData.reduce((acc, d) => acc + d.overtimeMinutes, 0)

        return {
            presentDays: presentDays.length,
            workDays: workDays.length,
            absentDays: absentDays.length,
            lateDays: lateDays.length,
            totalWorked: totalWorkedMinutes,
            totalOvertime: totalOvertimeMinutes,
            attendanceRate: workDays.length > 0 ? Math.round((presentDays.length / workDays.length) * 100) : 0,
            warningsDisabled: isVilaPeixoto
        }
    }

    const summary = React.useMemo(() => calculateFullSummary(filteredRecords), [filteredRecords, currentMonth, currentEmployeeSchedule])

    const formatMinutes = (minutes: number) => {
        if (!minutes || minutes === 0) return '-'
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return `${h}h ${m.toString().padStart(2, '0')}m`
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'normal':
                return <Badge className="bg-green-100 text-green-700 text-xs">OK</Badge>
            case 'late':
                return <Badge className="bg-orange-100 text-orange-700 text-xs">Atraso</Badge>
            case 'absent':
                return <Badge className="bg-red-100 text-red-700 text-xs">Falta</Badge>
            case 'weekend':
                return <Badge variant="secondary" className="text-xs">Fim-de-semana</Badge>
            default:
                return null
        }
    }

    const getDayOfWeek = (date: Date) => {
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        return days[getDay(date)]
    }

    const handlePreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
    const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))

    const selectedEmployeeObj = currentEmployeeObj
    const selectedEmployeeName = selectedEmployee === "all"
        ? "Todos os Colaboradores"
        : selectedEmployeeObj?.name || "Colaborador"

    const handleExportPDF = () => {
        const dataToExport = monthDays
            .filter(d => !d.isWeekend)
            .map(d => ({
                data: format(d.date, 'dd/MM/yyyy'),
                dia: getDayOfWeek(d.date),
                in1: d.in1 ? format(parseISO(d.in1), 'HH:mm') : '-',
                out1: d.out1 ? format(parseISO(d.out1), 'HH:mm') : '-',
                in2: d.in2 ? format(parseISO(d.in2), 'HH:mm') : '-',
                out2: d.out2 === 'auto' ? 'Est.' : (d.out2 ? format(parseISO(d.out2), 'HH:mm') : '-'),
                duracao: formatMinutes(d.workedMinutes),
                horasExtra: d.overtimeMinutes > 0 ? formatMinutes(d.overtimeMinutes) : '-',
                estado: d.status === 'absent' ? 'Falta' : (d.status === 'late' ? 'Atraso' : 'OK')
            }))

        const scheduleDesc = currentEmployeeObj?.scheduleName || currentEmployeeSchedule?.name || 'Horário Geral'

        exportToPDF(
            dataToExport,
            `${format(currentMonth, 'MMMM yyyy', { locale: pt })} • ${scheduleDesc}`,
            `Folha de Ponto — ${selectedEmployeeName} (Nº ${selectedEmployee})`
        )
    }

    const handlePrint = () => {
        window.print()
    }

    // Counts for roster cards
    const punchCountByEmp = React.useMemo(() => {
        const counts = new Map<string, number>()
        records.forEach(r => {
            counts.set(r.employeeId, (counts.get(r.employeeId) || 0) + 1)
        })
        return counts
    }, [records])

    return (
        <div className="p-8 space-y-6 print:p-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <div className="flex items-center gap-3">
                        {selectedEmployee !== "all" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedEmployee("all")}
                                className="h-8 gap-1"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Lista
                            </Button>
                        )}
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                            {selectedEmployee === "all" ? "Colaboradores & Folha de Ponto" : `Folha de Ponto — ${selectedEmployeeName}`}
                        </h1>
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        {selectedEmployee === "all"
                            ? `${employees.length} colaboradores registados • Consulta rápida de picagens (4 movimentos diários)`
                            : `Nº Mecanográfico: ${selectedEmployeeObj?.id || selectedEmployee} • Horário: ${selectedEmployeeObj?.scheduleName || currentEmployeeSchedule?.name || 'Horário Padrão'}`
                        }
                    </p>
                </div>
                <div className="flex gap-2">
                    {selectedEmployee !== "all" && (
                        <>
                            <Button variant="outline" onClick={handlePrint}>
                                <Printer className="h-4 w-4 mr-2" />
                                Imprimir
                            </Button>
                            <Button onClick={handleExportPDF} disabled={loading}>
                                <FileDown className="h-4 w-4 mr-2" />
                                Exportar PDF
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Controls Bar */}
            <Card className="border-none shadow-sm print:hidden">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Month Selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Mês de Referência
                            </label>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={handlePreviousMonth} title="Mês Anterior">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex-1 text-center font-semibold capitalize py-2 px-4 bg-neutral-100 dark:bg-neutral-800 rounded-md">
                                    {format(currentMonth, 'MMMM yyyy', { locale: pt })}
                                </div>
                                <Button variant="outline" size="icon" onClick={handleNextMonth} title="Próximo Mês">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {[
                                    { label: "Mês Atual", date: new Date() },
                                    { label: "Jul 2026", date: new Date(2026, 6, 1) },
                                    { label: "Jun 2026", date: new Date(2026, 5, 1) },
                                    { label: "Mai 2026", date: new Date(2026, 4, 1) },
                                    { label: "Abr 2026", date: new Date(2026, 3, 1) },
                                ].map((preset) => {
                                    const isSelected = format(currentMonth, 'yyyy-MM') === format(preset.date, 'yyyy-MM')
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => setCurrentMonth(preset.date)}
                                            className={cn(
                                                "text-xs px-2 py-0.5 rounded font-medium transition-all border",
                                                isSelected
                                                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-transparent shadow-xs"
                                                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 border-transparent"
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Employee Selector Dropdown */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Selecionar Colaborador
                            </label>
                            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecionar colaborador" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[350px]">
                                    <SelectItem value="all">
                                        👥 Todos os Colaboradores ({employees.length})
                                    </SelectItem>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            <span className="font-mono text-xs opacity-60 mr-2">[{emp.id}]</span>
                                            {emp.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Refresh */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                                <span>Estado da Sincronização</span>
                                <span className="text-xs font-normal text-neutral-500">
                                    {format(lastUpdate, 'HH:mm:ss')}
                                </span>
                            </label>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={fetchMonthData}
                                disabled={loading}
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                                {loading ? "A carregar..." : "Atualizar Registos"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Print Header */}
            <div className="hidden print:block mb-6">
                <h1 className="text-2xl font-bold text-center">FOLHA DE PONTO</h1>
                <p className="text-center mt-2">{format(currentMonth, 'MMMM yyyy', { locale: pt }).toUpperCase()}</p>
                <p className="text-center font-medium mt-1">{selectedEmployeeName} — Nº {selectedEmployee}</p>
                <p className="text-center text-xs text-neutral-600 mt-0.5">
                    Horário: {selectedEmployeeObj?.scheduleName || currentEmployeeSchedule?.name || 'Geral'}
                </p>
            </div>

            {error && (
                <Card className="border-red-200 bg-red-50 print:hidden">
                    <CardContent className="p-4">
                        <p className="text-sm text-red-600">❌ {error}</p>
                    </CardContent>
                </Card>
            )}

            {/* VIEW 1: MASTER LIST OF ALL COLLABORATORS */}
            {selectedEmployee === "all" ? (
                <div className="space-y-4 print:hidden">
                    {/* Search and stats bar */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                            <Input
                                placeholder="Filtrar por nome, número ou horário..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-10"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-neutral-500 self-end sm:self-auto">
                            <span>A mostrar <strong>{filteredEmployeesList.length}</strong> de <strong>{employees.length}</strong> colaboradores</span>
                        </div>
                    </div>

                    {/* Collaborator Grid / Roster */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredEmployeesList.map(emp => {
                            const punchesInMonth = punchCountByEmp.get(emp.id) || 0
                            return (
                                <Card
                                    key={emp.id}
                                    onClick={() => setSelectedEmployee(emp.id)}
                                    className="cursor-pointer border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md transition-all duration-150 group"
                                >
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="space-y-1 min-w-0 pr-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-mono text-xs px-1.5 py-0 bg-neutral-100 dark:bg-neutral-800 shrink-0">
                                                    #{emp.id}
                                                </Badge>
                                                <h4 className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100 group-hover:text-primary transition-colors">
                                                    {emp.name}
                                                </h4>
                                            </div>
                                            {emp.scheduleName && (
                                                <p className="text-xs text-neutral-500 truncate">
                                                    ⏰ {emp.scheduleName}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 pt-1 text-xs">
                                                {punchesInMonth > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        {punchesInMonth} picagens em {format(currentMonth, 'MMM', { locale: pt })}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-400 text-xs">
                                                        Sem picagens neste mês
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="opacity-80 group-hover:opacity-100 group-hover:bg-primary group-hover:text-white shrink-0 h-8 px-3"
                                        >
                                            Ver Folha →
                                        </Button>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </div>
            ) : (
                /* VIEW 2: INDIVIDUAL EMPLOYEE TIMESHEET WITH 4 DAILY MOVEMENTS */
                <>
                    {/* Schedule info banner */}
                    {currentEmployeeObj?.scheduleName && (
                        <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm print:border-none print:p-0">
                            <div className="flex items-center gap-2 text-blue-900 dark:text-blue-100 font-medium">
                                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                <span>Horário Oficial: <strong>{currentEmployeeObj.scheduleName}</strong></span>
                            </div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 font-mono">
                                Tolerância: 20 min • Almoço previsto: {currentEmployeeSchedule?.lunchDuration || 60}m
                            </div>
                        </div>
                    )}

                    {/* Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4 print:gap-2">
                        <Card className="border-none shadow-sm print:border print:shadow-none">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Dias Trabalhados
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {summary.presentDays} <span className="text-sm font-normal text-neutral-500">/ {summary.workDays}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm print:border print:shadow-none">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Total Horas
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatMinutes(summary.totalWorked)}</div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm print:border print:shadow-none">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2 text-orange-600">
                                    <Clock className="h-4 w-4" />
                                    Horas Extra
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">{formatMinutes(summary.totalOvertime)}</div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm print:border print:shadow-none">
                            <CardHeader className="pb-2">
                                <CardDescription className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    {summary.warningsDisabled ? 'Total de Faltas' : 'Faltas / Atrasos'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    <span className="text-red-600">{summary.absentDays}</span>
                                    {!summary.warningsDisabled && (
                                        <>
                                            <span className="text-neutral-400 mx-1">/</span>
                                            <span className="text-orange-600">{summary.lateDays}</span>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Timesheet Table with 4 Punches (In1, Out1, In2, Out2) */}
                    <Card className="border-none shadow-sm print:border print:shadow-none">
                        <CardHeader className="print:hidden">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="h-5 w-5" />
                                        Registo Diário de 4 Picagens — {selectedEmployeeName}
                                    </CardTitle>
                                    <CardDescription>
                                        {format(currentMonth, 'MMMM yyyy', { locale: pt })} • Nº {selectedEmployee}
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedEmployee("all")}
                                    className="gap-1.5"
                                >
                                    <Users className="h-4 w-4" />
                                    Ver Todos os Colaboradores
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="print:p-0">
                            <div className="rounded-md border overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-neutral-100 dark:bg-neutral-800 print:bg-gray-100">
                                            <th className="px-3 py-2.5 text-left font-medium">Data</th>
                                            <th className="px-2 py-2.5 text-left font-medium">Dia</th>
                                            <th className="px-2 py-2.5 text-center font-medium bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">Entr. Manhã</th>
                                            <th className="px-2 py-2.5 text-center font-medium bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">Saída Almoço</th>
                                            <th className="px-2 py-2.5 text-center font-medium bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">Entr. Tarde</th>
                                            <th className="px-2 py-2.5 text-center font-medium bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">Saída Fim</th>
                                            <th className="px-3 py-2.5 text-center font-medium">Duração</th>
                                            <th className="px-3 py-2.5 text-center font-medium">H. Extra</th>
                                            <th className="px-3 py-2.5 text-center font-medium print:hidden">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={9} className="text-center py-8 text-neutral-500">
                                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                                    A carregar folha de ponto...
                                                </td>
                                            </tr>
                                        ) : (
                                            monthDays.map((day) => (
                                                <tr
                                                    key={day.dateStr}
                                                    className={cn(
                                                        "border-t",
                                                        day.isWeekend && "bg-neutral-50 dark:bg-neutral-900/50 print:bg-gray-50",
                                                        day.status === 'absent' && "bg-red-50/50 print:bg-red-50",
                                                        day.status === 'late' && "bg-orange-50/50 print:bg-orange-50"
                                                    )}
                                                >
                                                    <td className="px-3 py-2 font-medium">
                                                        {format(day.date, 'dd/MM')}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {getDayOfWeek(day.date)}
                                                    </td>
                                                    {/* In 1 (Manhã) */}
                                                    <td className="px-2 py-2 text-center font-mono">
                                                        {day.in1 ? (
                                                            <span className={cn(
                                                                day.status === 'late' && "text-orange-600 font-bold"
                                                            )}>
                                                                {format(parseISO(day.in1), 'HH:mm')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-neutral-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* Out 1 (Almoço) */}
                                                    <td className="px-2 py-2 text-center font-mono">
                                                        {day.out1 ? (
                                                            <span>{format(parseISO(day.out1), 'HH:mm')}</span>
                                                        ) : (
                                                            <span className="text-neutral-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* In 2 (Tarde) */}
                                                    <td className="px-2 py-2 text-center font-mono">
                                                        {day.in2 ? (
                                                            <span>{format(parseISO(day.in2), 'HH:mm')}</span>
                                                        ) : (
                                                            <span className="text-neutral-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* Out 2 (Fim) */}
                                                    <td className="px-2 py-2 text-center font-mono">
                                                        {day.out2 === 'auto' ? (
                                                            <span className="text-xs text-neutral-400 italic">Saída Est.</span>
                                                        ) : day.out2 ? (
                                                            <span>{format(parseISO(day.out2), 'HH:mm')}</span>
                                                        ) : (
                                                            <span className="text-neutral-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* Duration */}
                                                    <td className="px-3 py-2 text-center font-medium">
                                                        {formatMinutes(day.workedMinutes)}
                                                    </td>
                                                    {/* Overtime */}
                                                    <td className="px-3 py-2 text-center">
                                                        {day.overtimeMinutes > 0 ? (
                                                            <span className="font-medium text-orange-600">
                                                                +{formatMinutes(day.overtimeMinutes)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-neutral-300">-</span>
                                                        )}
                                                    </td>
                                                    {/* Status Badge */}
                                                    <td className="px-3 py-2 text-center print:hidden">
                                                        {getStatusBadge(day.status)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-neutral-100 dark:bg-neutral-800 font-medium print:bg-gray-200">
                                            <td colSpan={6} className="px-3 py-3 text-right">
                                                TOTAL DO MÊS:
                                            </td>
                                            <td className="px-3 py-3 text-center font-bold">
                                                {formatMinutes(summary.totalWorked)}
                                            </td>
                                            <td className="px-3 py-3 text-center font-bold text-orange-600">
                                                {formatMinutes(summary.totalOvertime)}
                                            </td>
                                            <td className="print:hidden"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Signature Area (print only) */}
                    <div className="hidden print:block mt-12">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <div className="border-t border-black pt-2 text-center">
                                    <p className="text-sm">Assinatura do Colaborador</p>
                                </div>
                            </div>
                            <div>
                                <div className="border-t border-black pt-2 text-center">
                                    <p className="text-sm">Assinatura do Responsável</p>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-center mt-8 text-gray-500">
                            Documento gerado automaticamente pelo sistema Pontualidade.pt em {format(new Date(), 'dd/MM/yyyy HH:mm')}
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
