"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { pt } from "date-fns/locale"
import { Plus, Trash2, Clock, Search, Loader2, AlertCircle, CheckCircle2, UserPlus } from "lucide-react"

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

        // 1. Fetch corrections history first
        let loadedCorrections: Correction[] = []
        try {
            const corrRes = await fetch('/api/attendance/corrections').then(r => r.json())
            if (Array.isArray(corrRes)) {
                loadedCorrections = corrRes
                setCorrections(corrRes)
            }
        } catch (e) {
            console.error("Error fetching corrections:", e)
        }

        // 2. Fetch employee list from API (with fallback)
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

    // Combine employees from API and from past corrections
    const allEmployees = React.useMemo<Employee[]>(() => {
        const map = new Map<string, Employee>()

        fetchedEmployees.forEach(e => {
            if (e.workno) map.set(e.workno, e)
        })

        corrections.forEach(c => {
            if (c.workno && !map.has(c.workno)) {
                map.set(c.workno, {
                    workno: c.workno,
                    firstName: c.firstName,
                    lastName: c.lastName,
                    fullName: `${c.firstName} ${c.lastName}`.trim()
                })
            }
        })

        return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
    }, [fetchedEmployees, corrections])

    const isCustomMode = selectedWorkno === "custom"

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccessMessage(null)

        let targetWorkno = ""
        let firstName = ""
        let lastName = ""

        if (isCustomMode || allEmployees.length === 0) {
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
                setError("Por favor, selecione um colaborador da lista.")
                return
            }
            const emp = allEmployees.find(e => e.workno === selectedWorkno)
            if (!emp) {
                setError("Colaborador não encontrado.")
                return
            }
            targetWorkno = emp.workno
            firstName = emp.firstName
            lastName = emp.lastName
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

            setSuccessMessage("Picagem manual registada com sucesso!")
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
        if (!confirm("Tem a certeza que deseja remover esta picagem manual?")) return

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
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                    Correções de Ponto
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                    Adicione picagens manuais em falta. Elas serão integradas automaticamente nos relatórios e folhas de ponto.
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
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle>Adicionar Picagem</CardTitle>
                            <CardDescription>Preencha os dados da picagem em falta.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Employee Selector */}
                                <div className="space-y-2">
                                    <Label htmlFor="employee">Colaborador</Label>
                                    <Select value={selectedWorkno} onValueChange={setSelectedWorkno}>
                                        <SelectTrigger id="employee">
                                            <SelectValue placeholder={loading ? "A carregar colaboradores..." : "Selecione o colaborador..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allEmployees.map(emp => (
                                                <SelectItem key={emp.workno} value={emp.workno}>
                                                    {emp.fullName} ({emp.workno})
                                                </SelectItem>
                                            ))}
                                            <SelectItem value="custom" className="font-medium text-blue-600 dark:text-blue-400">
                                                ➕ Introduzir Manualmente / Novo Colaborador
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Custom Employee Inputs */}
                                {(isCustomMode || allEmployees.length === 0) && (
                                    <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border rounded-lg space-y-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="customWorkno" className="text-xs">ID / Nº de Funcionário</Label>
                                            <Input
                                                id="customWorkno"
                                                placeholder="Ex: 1, 2, 3..."
                                                value={customWorkno}
                                                onChange={e => setCustomWorkno(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="customName" className="text-xs">Nome Completo</Label>
                                            <Input
                                                id="customName"
                                                placeholder="Ex: Isabel Vaz"
                                                value={customName}
                                                onChange={e => setCustomName(e.target.value)}
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
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            A Guardar...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Registar Picagem
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
                        <CardHeader className="pb-3">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <CardTitle>Histórico de Registos Manuais</CardTitle>
                                    <CardDescription>Lista de todas as correções manuais inseridas.</CardDescription>
                                </div>
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500" />
                                    <Input
                                        placeholder="Pesquisar..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-2">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                    <span className="text-sm text-neutral-500">A carregar registos...</span>
                                </div>
                            ) : filteredCorrections.length === 0 ? (
                                <div className="text-center py-16 border border-dashed rounded-lg">
                                    <Clock className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
                                    <h3 className="font-semibold text-neutral-600 dark:text-neutral-300">Nenhum registo encontrado</h3>
                                    <p className="text-sm text-neutral-500 mt-1">Insira uma picagem em falta no formulário ao lado.</p>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[80px]">ID</TableHead>
                                                <TableHead>Colaborador</TableHead>
                                                <TableHead>Data/Hora</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Observação</TableHead>
                                                <TableHead className="w-[50px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredCorrections.map((corr) => {
                                                const typeInfo = CHECK_TYPES.find(t => t.value === corr.checktype)
                                                const dateObj = parseISO(corr.checktime)
                                                return (
                                                    <TableRow key={corr.id}>
                                                        <TableCell className="font-mono text-xs">{corr.workno}</TableCell>
                                                        <TableCell className="font-medium">{`${corr.firstName} ${corr.lastName}`}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span>{format(dateObj, "dd/MM/yyyy")}</span>
                                                                <span className="text-xs text-neutral-500">{format(dateObj, "HH:mm")}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={typeInfo?.color || ""}>
                                                                {typeInfo?.label.split(" (")[0] || `Tipo ${corr.checktype}`}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-neutral-500 text-sm">{corr.device}</TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-neutral-500 hover:text-red-500 hover:bg-red-500/10"
                                                                onClick={() => handleDelete(corr.id)}
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
