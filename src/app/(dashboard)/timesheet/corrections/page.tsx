"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { pt } from "date-fns/locale"
import { Plus, Trash2, Clock, Search, Loader2, AlertCircle, CheckCircle2, ShieldCheck, UserCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getEmployees } from "@/lib/api"

type Employee = {
    workno: string
    firstName: string
    lastName: string
    fullName: string
    isOfficial?: boolean
}

type Correction = {
    id: string
    workno: string
    firstName: string
    lastName: string
    checktime: string
    checktype: number
    device: string
    createdAt: string
}

// Colaboradores Pré-aprovados / Padrão (Exemplo VE e Geral)
const PRE_APPROVED_EMPLOYEES: Employee[] = [
    { workno: "1", firstName: "José", lastName: "Vaz", fullName: "José Vaz", isOfficial: true },
    { workno: "2", firstName: "Cláudia", lastName: "Fernandes", fullName: "Cláudia Fernandes", isOfficial: true },
    { workno: "3", firstName: "Isabel", lastName: "Vaz", fullName: "Isabel Vaz", isOfficial: true },
]

const CHECK_TYPES = [
    { value: 0, label: "Check-In (Entrada)", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
    { value: 1, label: "Check-Out (Saída)", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    { value: 2, label: "Break Start (Início Pausa)", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" },
    { value: 3, label: "Break End (Fim Pausa)", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    { value: 128, label: "Overtime In (Entrada H. Extra)", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
    { value: 129, label: "Overtime Out (Saída H. Extra)", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
]

export default function CorrectionsPage() {
    const [fetchedEmployees, setFetchedEmployees] = React.useState<Employee[]>([])
    const [corrections, setCorrections] = React.useState<Correction[]>([])
    const [loading, setLoading] = React.useState(true)
    const [submitting, setSubmitting] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

    // Form state
    const [selectedWorkno, setSelectedWorkno] = React.useState<string>("")
    const [customWorkno, setCustomWorkno] = React.useState<string>("")
    const [customName, setCustomName] = React.useState<string>("")
    const [dateStr, setDateStr] = React.useState<string>(format(new Date(), "yyyy-MM-dd"))
    const [timeStr, setTimeStr] = React.useState<string>("09:00")
    const [checktype, setChecktype] = React.useState<string>("0")
    const [device, setDevice] = React.useState<string>("Manual (Esquecimento)")

    // Filter
    const [searchTerm, setSearchTerm] = React.useState("")

    const fetchData = React.useCallback(async () => {
        setLoading(true)
        setError(null)

        // Fetch corrections history
        try {
            const corrRes = await fetch('/api/attendance/corrections').then(r => r.json())
            if (Array.isArray(corrRes)) {
                setCorrections(corrRes)
            }
        } catch (e) {
            console.error("Error fetching corrections:", e)
        }

        // Fetch employee list from API
        try {
            const empList = await getEmployees()
            setFetchedEmployees(empList || [])
        } catch (err: any) {
            console.warn("Could not fetch API employees list:", err)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        fetchData()
    }, [fetchData])

    // Combine pre-approved employees + API employees + employees from corrections history
    const allEmployees = React.useMemo<Employee[]>(() => {
        const map = new Map<string, Employee>()

        // 1. Add pre-approved
        PRE_APPROVED_EMPLOYEES.forEach(e => map.set(e.workno, e))

        // 2. Add API fetched
        fetchedEmployees.forEach(e => {
            if (e.workno) {
                map.set(e.workno, { ...e, isOfficial: true })
            }
        })

        // 3. Add corrections history
        corrections.forEach(c => {
            if (c.workno && !map.has(c.workno)) {
                map.set(c.workno, {
                    workno: c.workno,
                    firstName: c.firstName,
                    lastName: c.lastName,
                    fullName: `${c.firstName} ${c.lastName}`.trim(),
                    isOfficial: false
                })
            }
        })

        return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
    }, [fetchedEmployees, corrections])

    const isCustomMode = selectedWorkno === "custom"

    // Auto-match name when custom ID matches a known employee
    const handleCustomWorknoChange = (val: string) => {
        setCustomWorkno(val)
        const match = allEmployees.find(e => e.workno === val.trim())
        if (match) {
            setCustomName(match.fullName)
        }
    }

    const selectedEmployeeObj = allEmployees.find(e => e.workno === selectedWorkno)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccessMessage(null)

        let targetWorkno = ""
        let firstName = ""
        let lastName = ""

        if (isCustomMode) {
            if (!customWorkno.trim()) {
                setError("Por favor, introduza o ID/Número do colaborador.")
                return
            }
            if (!customName.trim()) {
                setError("Por favor, introduza o nome do colaborador.")
                return
            }
            targetWorkno = customWorkno.trim()
            const parts = customName.trim().split(" ")
            firstName = parts[0]
            lastName = parts.slice(1).join(" ") || parts[0]
        } else {
            if (!selectedWorkno) {
                setError("Por favor, selecione um colaborador aprovado da lista.")
                return
            }
            if (!selectedEmployeeObj) {
                setError("Colaborador não encontrado na lista do sistema.")
                return
            }
            targetWorkno = selectedEmployeeObj.workno
            firstName = selectedEmployeeObj.firstName
            lastName = selectedEmployeeObj.lastName
        }

        setSubmitting(true)

        try {
            const combinedDateTime = new Date(`${dateStr}T${timeStr}:00`)

            const res = await fetch('/api/attendance/corrections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workno: targetWorkno,
                    firstName,
                    lastName,
                    checktime: combinedDateTime.toISOString(),
                    checktype: Number(checktype),
                    device: device || "Manual"
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "Erro ao guardar a picagem")
            }

            setSuccessMessage(`Picagem aprovada e registada com sucesso para ${firstName} ${lastName}!`)
            fetchData()

            // Reset form
            setDevice("Manual (Esquecimento)")
            if (isCustomMode) {
                setCustomWorkno("")
                setCustomName("")
            }
        } catch (err: any) {
            setError(err.message || "Erro ao submeter")
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Tem a certeza que deseja remover esta picagem manual aprovada?")) return

        try {
            const res = await fetch(`/api/attendance/corrections/${id}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "Erro ao eliminar")
            }

            setCorrections(prev => prev.filter(c => c.id !== id))
            setSuccessMessage("Picagem removida com sucesso.")
        } catch (err: any) {
            setError(err.message || "Erro ao eliminar picagem")
        }
    }

    const filteredCorrections = React.useMemo(() => {
        if (!searchTerm) return corrections
        const term = searchTerm.toLowerCase()
        return corrections.filter(c =>
            c.workno.toLowerCase().includes(term) ||
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(term) ||
            c.device.toLowerCase().includes(term)
        )
    }, [corrections, searchTerm])

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                        Correções de Ponto
                    </h1>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1 text-blue-600" />
                        Aprovação de Registos
                    </Badge>
                </div>
                <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                    Adicione picagens manuais em falta. Os registos aprovados entram diretamente na folha de ponto e relatórios oficiais.
                </p>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {successMessage && (
                <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{successMessage}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form (1 col) */}
                <div className="lg:col-span-1">
                    <Card className="shadow-sm border-blue-100 dark:border-blue-900/50">
                        <CardHeader className="bg-neutral-50/50 dark:bg-neutral-900/50 border-b">
                            <CardTitle className="text-base flex items-center gap-2">
                                <UserCheck className="h-4 w-4 text-blue-600" />
                                Registar Picagem Oficial
                            </CardTitle>
                            <CardDescription>Selecione um colaborador aprovado do sistema.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Employee Selector */}
                                <div className="space-y-2">
                                    <Label htmlFor="employee">Colaborador Aprovado</Label>
                                    <Select value={selectedWorkno} onValueChange={setSelectedWorkno}>
                                        <SelectTrigger id="employee" className="bg-white dark:bg-neutral-900">
                                            <SelectValue placeholder={loading ? "A carregar colaboradores..." : "Selecione o colaborador..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allEmployees.map(emp => (
                                                <SelectItem key={emp.workno} value={emp.workno}>
                                                    <span className="font-medium">{emp.fullName}</span> (ID: {emp.workno})
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="custom" className="font-medium text-blue-600 dark:text-blue-400 border-t mt-1 pt-1">
                                                ➕ Outro Colaborador (Validação por ID)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Employee Validation Badge */}
                                {selectedEmployeeObj && !isCustomMode && (
                                    <div className="p-2.5 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-md flex items-center justify-between text-xs text-green-800 dark:text-green-300">
                                        <span className="flex items-center gap-1 font-medium">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                                            Colaborador Cadastrado
                                        </span>
                                        <span className="font-mono bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded">
                                            ID #{selectedEmployeeObj.workno}
                                        </span>
                                    </div>
                                )}

                                {/* Custom Employee Inputs */}
                                {isCustomMode && (
                                    <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg space-y-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="customWorkno" className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                                                ID / Número no Relógio
                                            </Label>
                                            <Input
                                                id="customWorkno"
                                                placeholder="Ex: 1, 2, 3..."
                                                value={customWorkno}
                                                onChange={e => handleCustomWorknoChange(e.target.value)}
                                                className="bg-white dark:bg-neutral-900"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="customName" className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                                                Nome do Colaborador
                                            </Label>
                                            <Input
                                                id="customName"
                                                placeholder="Ex: Isabel Vaz"
                                                value={customName}
                                                onChange={e => setCustomName(e.target.value)}
                                                className="bg-white dark:bg-neutral-900"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Data</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={dateStr}
                                            onChange={e => setDateStr(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="time">Hora</Label>
                                        <Input
                                            id="time"
                                            type="time"
                                            value={timeStr}
                                            onChange={e => setTimeStr(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="checktype">Tipo de Picagem</Label>
                                    <Select value={checktype} onValueChange={setChecktype}>
                                        <SelectTrigger id="checktype">
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CHECK_TYPES.map(ct => (
                                                <SelectItem key={ct.value} value={String(ct.value)}>
                                                    {ct.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="device">Observações / Motivo</Label>
                                    <Input
                                        id="device"
                                        placeholder="Ex: Manual, Serviço Externo"
                                        value={device}
                                        onChange={e => setDevice(e.target.value)}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            A Validar e Guardar...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Aprovar e Registar Picagem
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Corrections List Table (2 cols) */}
                <div className="lg:col-span-2">
                    <Card className="shadow-sm min-h-[450px]">
                        <CardHeader className="pb-3 border-b bg-neutral-50/50 dark:bg-neutral-900/50">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <CardTitle className="text-base">Picagens Manuais Aprovadas</CardTitle>
                                    <CardDescription>Histórico de correções que entram nos relatórios mensais.</CardDescription>
                                </div>
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
                                    <Input
                                        placeholder="Pesquisar por nome ou ID..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="pl-8 bg-white dark:bg-neutral-900"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-2">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                    <span className="text-sm text-neutral-500">A carregar registos aprovados...</span>
                                </div>
                            ) : filteredCorrections.length === 0 ? (
                                <div className="text-center py-16 border border-dashed rounded-lg">
                                    <Clock className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
                                    <h3 className="font-semibold text-neutral-600 dark:text-neutral-300">Nenhuma picagem manual registada</h3>
                                    <p className="text-sm text-neutral-500 mt-1">Selecione um colaborador ao lado para submeter uma correção.</p>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-neutral-50 dark:bg-neutral-900">
                                                <TableHead className="w-[70px]">ID</TableHead>
                                                <TableHead>Colaborador</TableHead>
                                                <TableHead>Data / Hora</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead>Motivo</TableHead>
                                                <TableHead className="w-[50px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredCorrections.map((corr) => {
                                                const typeInfo = CHECK_TYPES.find(t => t.value === corr.checktype)
                                                const dateObj = parseISO(corr.checktime)
                                                return (
                                                    <TableRow key={corr.id}>
                                                        <TableCell className="font-mono text-xs font-semibold">{corr.workno}</TableCell>
                                                        <TableCell className="font-medium">{`${corr.firstName} ${corr.lastName}`}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium">{format(dateObj, "dd/MM/yyyy")}</span>
                                                                <span className="text-xs text-neutral-500">{format(dateObj, "HH:mm")}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={typeInfo?.color || ""}>
                                                                {typeInfo?.label.split(" (")[0] || `Tipo ${corr.checktype}`}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 text-xs">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                Aprovado
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-neutral-500 text-sm">{corr.device}</TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                                                onClick={() => handleDelete(corr.id)}
                                                                title="Remover Picagem"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
