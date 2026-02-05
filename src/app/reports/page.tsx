"use client"

import * as React from "react"
import { addDays, format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { pt } from "date-fns/locale"
import { Calendar as CalendarIcon, FileDown, Search, RefreshCw, Clock, User, Users, Filter, ChevronDown } from "lucide-react"
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
import { exportToPDF, exportToExcel } from "@/lib/exports"
import { getAttendanceRecords } from "@/lib/api"

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
    { label: "Últimos 7 dias", value: "7d", getDates: () => ({ from: addDays(new Date(), -7), to: new Date() }) },
    { label: "Últimos 30 dias", value: "30d", getDates: () => ({ from: addDays(new Date(), -30), to: new Date() }) },
    { label: "Este mês", value: "thisMonth", getDates: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: "Mês passado", value: "lastMonth", getDates: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
    { label: "Últimos 3 meses", value: "3m", getDates: () => ({ from: addDays(new Date(), -90), to: new Date() }) },
    { label: "Últimos 6 meses", value: "6m", getDates: () => ({ from: addDays(new Date(), -180), to: new Date() }) },
    { label: "Este ano", value: "thisYear", getDates: () => ({ from: new Date(new Date().getFullYear(), 0, 1), to: new Date() }) },
]

export default function ReportsPage() {
    const [date, setDate] = React.useState<DateRange | undefined>({
        from: addDays(new Date(), -30),
        to: new Date(),
    })
    const [records, setRecords] = React.useState<AttendanceRecord[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [selectedEmployee, setSelectedEmployee] = React.useState<string>("all")
    const [selectedPeriod, setSelectedPeriod] = React.useState<string>("30d")
    const [activeTab, setActiveTab] = React.useState<string>("summary")

    // Extrair lista de colaboradores únicos
    const employees = React.useMemo<Employee[]>(() => {
        const empMap = new Map<string, { name: string; count: number }>()
        records.forEach(r => {
            const existing = empMap.get(r.employeeId)
            if (existing) {
                existing.count++
            } else {
                empMap.set(r.employeeId, { name: r.employeeName, count: 1 })
            }
        })
        return Array.from(empMap.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            recordCount: data.count
        })).sort((a, b) => a.name.localeCompare(b.name))
    }, [records])

    const fetchRecords = React.useCallback(async () => {
        if (!date?.from || !date?.to) return;

        setLoading(true);
        setError(null);

        try {
            const beginTime = date.from.toISOString().replace('Z', '+00:00');
            const endTime = date.to.toISOString().replace('Z', '+00:00');

            const response = await getAttendanceRecords(beginTime, endTime);

            const formattedRecords: AttendanceRecord[] = response.payload.list.map(item => ({
                uuid: item.uuid,
                employeeName: `${item.employee.first_name} ${item.employee.last_name}`.trim(),
                employeeId: item.employee.workno,
                checktime: item.checktime,
                checktype: item.checktype,
                deviceName: item.device.name,
                deviceSerial: item.device.serial_number
            }));

            setRecords(formattedRecords);
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar registos');
            console.error('Error fetching records:', err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    React.useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    // Filtrar registos pelo colaborador selecionado
    const filteredRecords = React.useMemo(() => {
        if (selectedEmployee === "all") return records
        return records.filter(r => r.employeeId === selectedEmployee)
    }, [records, selectedEmployee])

    // Agrupar registos por data e funcionário e calcular horas reais
    const dailySummaries = React.useMemo(() => {
        const groups: Record<string, AttendanceRecord[]> = {};

        filteredRecords.forEach(record => {
            const dateKey = format(parseISO(record.checktime), 'yyyy-MM-dd');
            const groupKey = `${dateKey}_${record.employeeId}`;
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(record);
        });

        return Object.values(groups).map(group => {
            const sorted = [...group].sort((a, b) =>
                parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime()
            );

            const first = sorted[0];
            const last = sorted[sorted.length - 1];

            let workDurationMs = 0;
            let lastInTime: number | null = null;

            sorted.forEach(record => {
                const time = parseISO(record.checktime).getTime();
                const isEntry = record.checktype === 0 || record.checktype === 128;
                const isExit = record.checktype === 1 || record.checktype === 129;

                if (isEntry) {
                    lastInTime = time;
                } else if (isExit && lastInTime !== null) {
                    workDurationMs += (time - lastInTime);
                    lastInTime = null;
                }
            });

            const hours = Math.floor(workDurationMs / (1000 * 60 * 60));
            const minutes = Math.floor((workDurationMs % (1000 * 60 * 60)) / (1000 * 60));
            const durationStr = workDurationMs > 0 ? `${hours}h ${minutes}m` : "-";

            const standardWorkDayMs = 8 * 60 * 60 * 1000;
            const overtimeMs = Math.max(0, workDurationMs - standardWorkDayMs);

            const otHours = Math.floor(overtimeMs / (1000 * 60 * 60));
            const otMinutes = Math.floor((overtimeMs % (1000 * 60 * 60)) / (1000 * 60));
            const overtimeStr = overtimeMs > 0 ? `+${otHours}h ${otMinutes}m` : "-";

            return {
                id: `${first.employeeId}_${first.checktime}`,
                date: format(parseISO(first.checktime), 'yyyy-MM-dd'),
                employeeId: first.employeeId,
                employeeName: first.employeeName,
                firstIn: first.checktime,
                lastOut: (sorted.length > 1 && lastInTime === null) ? last.checktime : null,
                duration: durationStr,
                durationMs: workDurationMs,
                overtime: overtimeStr,
                overtimeMs: overtimeMs,
                recordCount: group.length,
                allRecords: sorted
            };
        }).sort((a, b) => b.firstIn.localeCompare(a.firstIn));
    }, [filteredRecords]);

    // Estatísticas do colaborador selecionado
    const stats = React.useMemo(() => {
        const uniqueEmployees = selectedEmployee === "all"
            ? new Set(filteredRecords.map(r => r.employeeId)).size
            : 1;
        const totalDaysWork = dailySummaries.length;

        const totalWorkMs = dailySummaries.reduce((acc, s) => acc + s.durationMs, 0);
        const workHours = Math.floor(totalWorkMs / (1000 * 60 * 60));
        const workMinutes = Math.floor((totalWorkMs % (1000 * 60 * 60)) / (1000 * 60));
        const totalWorkStr = `${workHours}h ${workMinutes}m`;

        const totalOtMs = dailySummaries.reduce((acc, s) => acc + s.overtimeMs, 0);
        const otHours = Math.floor(totalOtMs / (1000 * 60 * 60));
        const otMinutes = Math.floor((totalOtMs % (1000 * 60 * 60)) / (1000 * 60));
        const totalOvertimeStr = `${otHours}h ${otMinutes}m`;

        const avgHoursPerDay = totalDaysWork > 0
            ? (totalWorkMs / totalDaysWork / (1000 * 60 * 60)).toFixed(1)
            : "0";

        return { uniqueEmployees, totalDaysWork, totalWorkStr, totalOvertimeStr, avgHoursPerDay };
    }, [filteredRecords, dailySummaries, selectedEmployee]);

    // Histórico detalhado de todas as picagens
    const detailedHistory = React.useMemo(() => {
        return [...filteredRecords].sort((a, b) =>
            parseISO(b.checktime).getTime() - parseISO(a.checktime).getTime()
        );
    }, [filteredRecords]);

    const handlePeriodChange = (value: string) => {
        setSelectedPeriod(value);
        const preset = PRESET_PERIODS.find(p => p.value === value);
        if (preset) {
            setDate(preset.getDates());
        }
    }

    const handleExportPDF = () => {
        const employeeName = selectedEmployee === "all"
            ? "Todos"
            : employees.find(e => e.id === selectedEmployee)?.name || "Colaborador";

        const dataToExport = dailySummaries.map(s => ({
            data: format(parseISO(s.firstIn), 'dd/MM/yyyy', { locale: pt }),
            funcionario: s.employeeName,
            id: s.employeeId,
            entrada: format(parseISO(s.firstIn), 'HH:mm'),
            saida: s.lastOut ? format(parseISO(s.lastOut), 'HH:mm') : '-',
            duracao: s.duration,
            horasExtra: s.overtime
        }));
        exportToPDF(dataToExport, `${employeeName} - ${format(date?.from || new Date(), "MMM yyyy", { locale: pt })}`);
    };

    const handleExportExcel = () => {
        const dataToExport = dailySummaries.map(s => ({
            data: format(parseISO(s.firstIn), 'dd/MM/yyyy', { locale: pt }),
            funcionario: s.employeeName,
            id_funcionario: s.employeeId,
            entrada: format(parseISO(s.firstIn), 'HH:mm'),
            saida: s.lastOut ? format(parseISO(s.lastOut), 'HH:mm') : '-',
            duracao_total: s.duration,
            horas_extra: s.overtime,
            registos_no_dia: s.recordCount
        }));
        exportToExcel(dataToExport);
    };

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
                        variant="outline"
                        className="shadow-sm"
                        onClick={handleExportPDF}
                        disabled={loading || dailySummaries.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        PDF
                    </Button>
                    <Button
                        variant="outline"
                        className="shadow-sm"
                        onClick={handleExportExcel}
                        disabled={loading || dailySummaries.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Excel
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <Card className="border-none shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filtros
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Período
                            </label>
                            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                                <SelectTrigger className="w-full">
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
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Datas Personalizadas
                            </label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
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
                    </div>

                    <div className="mt-4 flex justify-end">
                        <Button onClick={fetchRecords} disabled={loading}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                            Atualizar Dados
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Estatísticas do Colaborador */}
            <div className="grid gap-4 md:grid-cols-5">
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
                                {dailySummaries.length} dias de trabalho registados
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
                                            <TableHead className="text-center">Duração</TableHead>
                                            <TableHead className="text-center">Horas Extra</TableHead>
                                            <TableHead className="text-right">Registos</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-neutral-500">
                                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                                    A carregar relatórios...
                                                </TableCell>
                                            </TableRow>
                                        ) : dailySummaries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-neutral-500">
                                                    Sem atividade no período selecionado
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dailySummaries.map((summary) => {
                                                const hasOvertime = summary.overtimeMs > 0;
                                                return (
                                                    <TableRow key={summary.id}>
                                                        <TableCell className="font-medium">
                                                            {format(parseISO(summary.firstIn), 'dd MMM yyyy', { locale: pt })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-neutral-900 dark:text-neutral-100">{summary.employeeName}</span>
                                                                <span className="text-xs text-neutral-500">ID: {summary.employeeId}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                                                {format(parseISO(summary.firstIn), 'HH:mm')}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {summary.lastOut ? (
                                                                <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                                                    {format(parseISO(summary.lastOut), 'HH:mm')}
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] text-neutral-400 italic">Sem saída</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                                                                {summary.duration}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {hasOvertime ? (
                                                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-bold">
                                                                    {summary.overtime}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-neutral-300">-</span>
                                                            )}
                                                        </TableCell>
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
        </div>
    )
}
