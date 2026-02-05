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
    addMonths
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
    Printer,
    AlertCircle
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { exportToPDF } from "@/lib/exports"
import { getAttendanceRecords } from "@/lib/api"

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
    firstIn: string | null
    lastOut: string | null
    workedMinutes: number
    overtimeMinutes: number
    status: 'normal' | 'late' | 'absent' | 'weekend' | 'holiday'
}

type Employee = {
    id: string
    name: string
}

const WORK_START_HOUR = 9
const WORK_START_MINUTES = 15
const STANDARD_WORK_MINUTES = 8 * 60 // 8 hours

export default function TimesheetPage() {
    const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date())
    const [records, setRecords] = React.useState<AttendanceRecord[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [selectedEmployee, setSelectedEmployee] = React.useState<string>("all")

    // Extract unique employees
    const employees = React.useMemo<Employee[]>(() => {
        const empMap = new Map<string, string>()
        records.forEach(r => {
            if (!empMap.has(r.employeeId)) {
                empMap.set(r.employeeId, r.employeeName)
            }
        })
        return Array.from(empMap.entries()).map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [records])

    const fetchMonthRecords = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const monthStart = startOfMonth(currentMonth)
            const monthEnd = endOfMonth(currentMonth)

            const beginTime = monthStart.toISOString().replace('Z', '+00:00')
            const endTime = monthEnd.toISOString().replace('Z', '+00:00')

            const response = await getAttendanceRecords(beginTime, endTime)

            const formattedRecords: AttendanceRecord[] = response.payload.list.map(item => ({
                uuid: item.uuid,
                employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
                employeeId: item.employee.workno,
                checktime: item.checktime,
                checktype: item.checktype,
            }))

            setRecords(formattedRecords)
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar dados')
            console.error('Error fetching records:', err)
        } finally {
            setLoading(false)
        }
    }, [currentMonth])

    React.useEffect(() => {
        fetchMonthRecords()
    }, [fetchMonthRecords])

    // Filter records by selected employee
    const filteredRecords = React.useMemo(() => {
        if (selectedEmployee === "all") return records
        return records.filter(r => r.employeeId === selectedEmployee)
    }, [records, selectedEmployee])

    // Build daily records for the month
    const monthDays = React.useMemo<DayRecord[]>(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(currentMonth)
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

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
                    firstIn: null,
                    lastOut: null,
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
                    firstIn: null,
                    lastOut: null,
                    workedMinutes: 0,
                    overtimeMinutes: 0,
                    status: 'absent' as const
                }
            }

            // Sort records by time
            const sorted = [...dayRecords].sort((a, b) =>
                parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime()
            )

            const firstCheck = sorted[0]
            const lastCheck = sorted[sorted.length - 1]
            const firstCheckDate = parseISO(firstCheck.checktime)

            // Calculate worked time
            let workedMinutes = 0
            let lastInTime: number | null = null

            sorted.forEach(record => {
                const time = parseISO(record.checktime).getTime()
                const isEntry = record.checktype === 0 || record.checktype === 128
                const isExit = record.checktype === 1 || record.checktype === 129

                if (isEntry) {
                    lastInTime = time
                } else if (isExit && lastInTime !== null) {
                    workedMinutes += (time - lastInTime) / (1000 * 60)
                    lastInTime = null
                }
            })

            workedMinutes = Math.round(workedMinutes)
            const overtimeMinutes = Math.max(0, workedMinutes - STANDARD_WORK_MINUTES)

            // Determine if late
            const isLate = firstCheckDate.getHours() > WORK_START_HOUR ||
                (firstCheckDate.getHours() === WORK_START_HOUR && firstCheckDate.getMinutes() > WORK_START_MINUTES)

            return {
                date: day,
                dateStr,
                isWeekend: false,
                firstIn: firstCheck.checktime,
                lastOut: lastCheck.checktype === 1 || lastCheck.checktype === 129 ? lastCheck.checktime : null,
                workedMinutes,
                overtimeMinutes,
                status: isLate ? 'late' as const : 'normal' as const
            }
        })
    }, [currentMonth, filteredRecords])

    // Calculate monthly summary
    const summary = React.useMemo(() => {
        const workDays = monthDays.filter(d => !d.isWeekend)
        const presentDays = workDays.filter(d => d.workedMinutes > 0)
        const absentDays = workDays.filter(d => d.status === 'absent')
        const lateDays = workDays.filter(d => d.status === 'late')

        const totalWorkedMinutes = monthDays.reduce((acc, d) => acc + d.workedMinutes, 0)
        const totalOvertimeMinutes = monthDays.reduce((acc, d) => acc + d.overtimeMinutes, 0)

        const workedHours = Math.floor(totalWorkedMinutes / 60)
        const workedMins = totalWorkedMinutes % 60
        const overtimeHours = Math.floor(totalOvertimeMinutes / 60)
        const overtimeMins = totalOvertimeMinutes % 60

        return {
            workDays: workDays.length,
            presentDays: presentDays.length,
            absentDays: absentDays.length,
            lateDays: lateDays.length,
            totalWorked: `${workedHours}h ${workedMins}m`,
            totalOvertime: `${overtimeHours}h ${overtimeMins}m`,
            attendanceRate: workDays.length > 0
                ? Math.round((presentDays.length / workDays.length) * 100)
                : 0
        }
    }, [monthDays])

    const formatMinutes = (minutes: number) => {
        if (minutes === 0) return '-'
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

    const selectedEmployeeName = selectedEmployee === "all"
        ? "Todos os Colaboradores"
        : employees.find(e => e.id === selectedEmployee)?.name || "Colaborador"

    const handleExportPDF = () => {
        const dataToExport = monthDays
            .filter(d => !d.isWeekend)
            .map(d => ({
                data: format(d.date, 'dd/MM/yyyy'),
                dia: getDayOfWeek(d.date),
                entrada: d.firstIn ? format(parseISO(d.firstIn), 'HH:mm') : '-',
                saida: d.lastOut ? format(parseISO(d.lastOut), 'HH:mm') : '-',
                duracao: formatMinutes(d.workedMinutes),
                horasExtra: d.overtimeMinutes > 0 ? formatMinutes(d.overtimeMinutes) : '-',
                estado: d.status === 'absent' ? 'Falta' : d.status === 'late' ? 'Atraso' : 'OK'
            }))

        exportToPDF(
            dataToExport,
            `Folha de Ponto - ${selectedEmployeeName} - ${format(currentMonth, 'MMMM yyyy', { locale: pt })}`
        )
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="p-8 space-y-6 print:p-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                        Folha de Ponto Mensal
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Relatório oficial para RH e processamento de salários
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="h-4 w-4 mr-2" />
                        Imprimir
                    </Button>
                    <Button onClick={handleExportPDF} disabled={loading}>
                        <FileDown className="h-4 w-4 mr-2" />
                        Exportar PDF
                    </Button>
                </div>
            </div>

            {/* Controls */}
            <Card className="border-none shadow-sm print:hidden">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Month Selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Mês
                            </label>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex-1 text-center font-medium py-2 px-4 bg-neutral-100 dark:bg-neutral-800 rounded-md">
                                    {format(currentMonth, 'MMMM yyyy', { locale: pt })}
                                </div>
                                <Button variant="outline" size="icon" onClick={handleNextMonth}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Employee Selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Colaborador
                            </label>
                            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecionar colaborador" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Colaboradores</SelectItem>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Refresh */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                &nbsp;
                            </label>
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={fetchMonthRecords}
                                disabled={loading}
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                                Atualizar
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Print Header */}
            <div className="hidden print:block mb-6">
                <h1 className="text-2xl font-bold text-center">FOLHA DE PONTO</h1>
                <p className="text-center mt-2">{format(currentMonth, 'MMMM yyyy', { locale: pt }).toUpperCase()}</p>
                <p className="text-center font-medium mt-1">{selectedEmployeeName}</p>
            </div>

            {error && (
                <Card className="border-red-200 bg-red-50 print:hidden">
                    <CardContent className="p-4">
                        <p className="text-sm text-red-600">❌ {error}</p>
                    </CardContent>
                </Card>
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
                        <div className="text-2xl font-bold">{summary.totalWorked}</div>
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
                        <div className="text-2xl font-bold text-orange-600">{summary.totalOvertime}</div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm print:border print:shadow-none">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            Faltas / Atrasos
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            <span className="text-red-600">{summary.absentDays}</span>
                            <span className="text-neutral-400 mx-1">/</span>
                            <span className="text-orange-600">{summary.lateDays}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Timesheet Table */}
            <Card className="border-none shadow-sm print:border print:shadow-none">
                <CardHeader className="print:hidden">
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Registo Diário - {selectedEmployeeName}
                    </CardTitle>
                    <CardDescription>
                        {format(currentMonth, 'MMMM yyyy', { locale: pt })}
                    </CardDescription>
                </CardHeader>
                <CardContent className="print:p-0">
                    <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-neutral-100 dark:bg-neutral-800 print:bg-gray-100">
                                    <th className="px-3 py-2 text-left font-medium">Data</th>
                                    <th className="px-3 py-2 text-left font-medium">Dia</th>
                                    <th className="px-3 py-2 text-center font-medium">Entrada</th>
                                    <th className="px-3 py-2 text-center font-medium">Saída</th>
                                    <th className="px-3 py-2 text-center font-medium">Duração</th>
                                    <th className="px-3 py-2 text-center font-medium">H. Extra</th>
                                    <th className="px-3 py-2 text-center font-medium print:hidden">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-neutral-500">
                                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                            A carregar folha de ponto...
                                        </td>
                                    </tr>
                                ) : (
                                    monthDays.map((day, index) => (
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
                                            <td className="px-3 py-2">
                                                {getDayOfWeek(day.date)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day.firstIn ? (
                                                    <span className={cn(
                                                        "font-mono",
                                                        day.status === 'late' && "text-orange-600"
                                                    )}>
                                                        {format(parseISO(day.firstIn), 'HH:mm')}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day.lastOut ? (
                                                    <span className="font-mono">
                                                        {format(parseISO(day.lastOut), 'HH:mm')}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center font-medium">
                                                {formatMinutes(day.workedMinutes)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {day.overtimeMinutes > 0 ? (
                                                    <span className="font-medium text-orange-600">
                                                        +{formatMinutes(day.overtimeMinutes)}
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center print:hidden">
                                                {getStatusBadge(day.status)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="bg-neutral-100 dark:bg-neutral-800 font-medium print:bg-gray-200">
                                    <td colSpan={4} className="px-3 py-3 text-right">
                                        TOTAL DO MÊS:
                                    </td>
                                    <td className="px-3 py-3 text-center font-bold">
                                        {summary.totalWorked}
                                    </td>
                                    <td className="px-3 py-3 text-center font-bold text-orange-600">
                                        {summary.totalOvertime}
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
        </div>
    )
}
