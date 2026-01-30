"use client"

import * as React from "react"
import { addDays, format, parseISO } from "date-fns"
import { pt } from "date-fns/locale"
import { Calendar as CalendarIcon, FileDown, Search, RefreshCw, Clock, User, Smartphone } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

// Mapeamento dos tipos de check (baseado em sistemas de ponto típicos)
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

export default function ReportsPage() {
    const [date, setDate] = React.useState<DateRange | undefined>({
        from: addDays(new Date(), -30),
        to: new Date(),
    })
    const [records, setRecords] = React.useState<AttendanceRecord[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [searchTerm, setSearchTerm] = React.useState("")

    const fetchRecords = React.useCallback(async () => {
        if (!date?.from || !date?.to) return;

        setLoading(true);
        setError(null);

        try {
            const beginTime = date.from.toISOString().replace('Z', '+00:00');
            const endTime = date.to.toISOString().replace('Z', '+00:00');

            const response = await getAttendanceRecords(beginTime, endTime, 1, 100);

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

    // Agrupar registos por data e funcionário
    const dailySummaries = React.useMemo(() => {
        const groups: Record<string, AttendanceRecord[]> = {};

        records.forEach(record => {
            const dateKey = format(parseISO(record.checktime), 'yyyy-MM-dd');
            const groupKey = `${dateKey}_${record.employeeId}`;
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(record);
        });

        return Object.values(groups).map(group => {
            // Ordenar por hora
            const sorted = [...group].sort((a, b) =>
                parseISO(a.checktime).getTime() - parseISO(b.checktime).getTime()
            );

            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const sameRecord = sorted.length === 1;

            // Calcular duração total (entre o primeiro e o último do dia)
            const start = parseISO(first.checktime);
            const end = parseISO(last.checktime);
            const durationMs = end.getTime() - start.getTime();

            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            const durationStr = sameRecord ? "-" : `${hours}h ${minutes}m`;

            // Horas Extra: tudo o que passar de 9h (32400000 ms)
            const overtimeMs = Math.max(0, durationMs - (9 * 60 * 60 * 1000));
            const otHours = Math.floor(overtimeMs / (1000 * 60 * 60));
            const otMinutes = Math.floor((overtimeMs % (1000 * 60 * 60)) / (1000 * 60));
            const overtimeStr = overtimeMs > 0 ? `+${otHours}h ${otMinutes}m` : "-";

            return {
                id: `${first.employeeId}_${first.checktime}`,
                date: format(parseISO(first.checktime), 'yyyy-MM-dd'),
                employeeId: first.employeeId,
                employeeName: first.employeeName,
                firstIn: first.checktime,
                lastOut: sameRecord ? null : last.checktime,
                duration: durationStr,
                durationMs: durationMs,
                overtime: overtimeStr,
                overtimeMs: overtimeMs,
                recordCount: group.length,
                allRecords: sorted
            };
        }).sort((a, b) => b.firstIn.localeCompare(a.firstIn));
    }, [records]);

    const filteredSummaries = React.useMemo(() => {
        if (!searchTerm) return dailySummaries;
        return dailySummaries.filter(s =>
            s.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.employeeId.includes(searchTerm)
        );
    }, [dailySummaries, searchTerm]);

    // Estatísticas (baseadas nos resumos diários)
    const stats = React.useMemo(() => {
        const uniqueEmployees = new Set(records.map(r => r.employeeId)).size;
        const totalDaysWork = filteredSummaries.length;

        // Calcular total de horas extra no período filtrado
        const totalOtMs = filteredSummaries.reduce((acc, s) => acc + s.overtimeMs, 0);
        const otHours = Math.floor(totalOtMs / (1000 * 60 * 60));
        const otMinutes = Math.floor((totalOtMs % (1000 * 60 * 60)) / (1000 * 60));
        const totalOvertimeStr = `${otHours}h ${otMinutes}m`;

        return { uniqueEmployees, totalDaysWork, totalOvertimeStr };
    }, [records, filteredSummaries]);

    const handleExportPDF = () => {
        const dataToExport = filteredSummaries.map(s => ({
            data: format(parseISO(s.firstIn), 'dd/MM/yyyy', { locale: pt }),
            funcionario: s.employeeName,
            id: s.employeeId,
            entrada: format(parseISO(s.firstIn), 'HH:mm'),
            saida: s.lastOut ? format(parseISO(s.lastOut), 'HH:mm') : '-',
            duracao: s.duration,
            horasExtra: s.overtime
        }));
        exportToPDF(dataToExport, date?.from ? format(date.from, "MMMM yyyy", { locale: pt }) : "Geral");
    };

    const handleExportExcel = () => {
        const dataToExport = filteredSummaries.map(s => ({
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

    return (
        <div className="p-8 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                        Relatórios de Assiduidade
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Dados em tempo real da API CrossChex Cloud
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="shadow-sm"
                        onClick={handleExportPDF}
                        disabled={loading || filteredSummaries.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar PDF
                    </Button>
                    <Button
                        variant="outline"
                        className="shadow-sm"
                        onClick={handleExportExcel}
                        disabled={loading || filteredSummaries.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar Excel
                    </Button>
                </div>
            </div>

            {/* Estatísticas */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Colaboradores Ativos
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.uniqueEmployees}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            Dias de Trabalho
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalDaysWork}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-600" />
                            Total Horas Extra
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{stats.totalOvertimeStr}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Registos de Ponto</CardTitle>
                            <CardDescription>
                                {filteredSummaries.length} {filteredSummaries.length === 1 ? 'relatório' : 'relatórios'} encontrados
                            </CardDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={fetchRecords}
                            disabled={loading}
                        >
                            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                            Atualizar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className={cn("grid gap-2")}>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant={"outline"}
                                        className={cn(
                                            "w-[300px] justify-start text-left font-normal",
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
                                        onSelect={setDate}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="relative w-full md:w-[300px]">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-neutral-500" />
                            <Input
                                placeholder="Pesquisar funcionário..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-sm text-red-600">❌ {error}</p>
                        </div>
                    )}

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
                                            A carregar relatórios agrupados...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredSummaries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-neutral-500">
                                            {searchTerm ? 'Nenhum resultado para esta pesquisa' : 'Sem atividade no período selecionado'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredSummaries.map((summary) => {
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
        </div>
    )
}
