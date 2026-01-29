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

    const filteredRecords = React.useMemo(() => {
        if (!searchTerm) return records;
        return records.filter(r =>
            r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.employeeId.includes(searchTerm) ||
            r.deviceName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [records, searchTerm]);

    // Estatísticas
    const stats = React.useMemo(() => {
        const uniqueEmployees = new Set(records.map(r => r.employeeId)).size;
        const uniqueDevices = new Set(records.map(r => r.deviceSerial)).size;
        const checkIns = records.filter(r => r.checktype === 0).length;
        const checkOuts = records.filter(r => r.checktype === 1).length;

        return { uniqueEmployees, uniqueDevices, checkIns, checkOuts };
    }, [records]);

    const handleExportPDF = () => {
        const dataToExport = filteredRecords.map(r => {
            const checkInfo = getCheckTypeInfo(r.checktype);
            return {
                data: format(parseISO(r.checktime), 'dd/MM/yyyy HH:mm', { locale: pt }),
                funcionario: r.employeeName,
                id: r.employeeId,
                tipo: checkInfo.label,
                dispositivo: r.deviceName,
                horasExtra: '-'
            };
        });
        exportToPDF(dataToExport, date?.from ? format(date.from, "MMMM yyyy", { locale: pt }) : "Geral");
    };

    const handleExportExcel = () => {
        const dataToExport = filteredRecords.map(r => {
            const checkInfo = getCheckTypeInfo(r.checktype);
            return {
                data: format(parseISO(r.checktime), 'dd/MM/yyyy', { locale: pt }),
                hora: format(parseISO(r.checktime), 'HH:mm'),
                funcionario: r.employeeName,
                id_funcionario: r.employeeId,
                tipo_registo: checkInfo.label,
                dispositivo: r.deviceName,
                serial_dispositivo: r.deviceSerial
            };
        });
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
                        disabled={loading || filteredRecords.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar PDF
                    </Button>
                    <Button
                        variant="outline"
                        className="shadow-sm"
                        onClick={handleExportExcel}
                        disabled={loading || filteredRecords.length === 0}
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar Excel
                    </Button>
                </div>
            </div>

            {/* Estatísticas */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Colaboradores
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.uniqueEmployees}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4" />
                            Dispositivos
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.uniqueDevices}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-green-600" />
                            Check-Ins
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.checkIns}</div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-red-600" />
                            Check-Outs
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.checkOuts}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Registos de Ponto</CardTitle>
                            <CardDescription>
                                {filteredRecords.length} {filteredRecords.length === 1 ? 'registo' : 'registos'} encontrados
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
                                placeholder="Pesquisar..."
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

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-50">
                                    <TableHead className="w-[180px]">Data e Hora</TableHead>
                                    <TableHead>Funcionário</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Dispositivo</TableHead>
                                    <TableHead className="text-right">Serial</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-neutral-500">
                                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                                            A carregar registos...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredRecords.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-neutral-500">
                                            {searchTerm ? 'Nenhum registo encontrado' : 'Sem registos no período selecionado'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRecords.map((record) => {
                                        const checkInfo = getCheckTypeInfo(record.checktype);

                                        return (
                                            <TableRow key={record.uuid}>
                                                <TableCell className="font-medium text-neutral-700 dark:text-neutral-300">
                                                    {format(parseISO(record.checktime), 'dd MMM yyyy, HH:mm', { locale: pt })}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{record.employeeName}</span>
                                                        <span className="text-xs text-neutral-500">ID: {record.employeeId}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={cn("font-normal", checkInfo.color)}>
                                                        {checkInfo.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm">{record.deviceName}</span>
                                                </TableCell>
                                                <TableCell className="text-right text-xs text-neutral-500 font-mono">
                                                    {record.deviceSerial}
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
