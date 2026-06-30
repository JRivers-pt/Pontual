"use client"

import * as React from "react"
import {
    Plus,
    Trash2,
    Clock,
    User,
    Calendar,
    AlertCircle,
    CheckCircle,
    Loader2,
    Search
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { pt } from "date-fns/locale"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

interface Correction {
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
    { value: 0, label: "Entrada (Check-In)", color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" },
    { value: 1, label: "Saída (Check-Out)", color: "bg-rose-500/20 text-rose-500 border-rose-500/30" },
    { value: 2, label: "Início Pausa (Break Start)", color: "bg-amber-500/20 text-amber-500 border-amber-500/30" },
    { value: 3, label: "Fim Pausa (Break End)", color: "bg-blue-500/20 text-blue-500 border-blue-500/30" },
    { value: 128, label: "Entrada Horas Extra", color: "bg-indigo-500/20 text-indigo-500 border-indigo-500/30" },
    { value: 129, label: "Saída Horas Extra", color: "bg-violet-500/20 text-violet-500 border-violet-500/30" },
]

export default function CorrectionsPage() {
    const [corrections, setCorrections] = React.useState<Correction[]>([])
    const [loading, setLoading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState<string | null>(null)
    const [searchTerm, setSearchTerm] = React.useState("")

    // Form states
    const [workno, setWorkno] = React.useState("")
    const [firstName, setFirstName] = React.useState("")
    const [lastName, setLastName] = React.useState("")
    const [date, setDate] = React.useState("")
    const [time, setTime] = React.useState("")
    const [checktype, setChecktype] = React.useState<string>("")
    const [device, setDevice] = React.useState("Manual")

    // Fetch existing corrections
    const fetchCorrections = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/attendance/corrections")
            if (!res.ok) throw new Error("Erro ao obter correções")
            const data = await res.json()
            setCorrections(data)
        } catch (err: any) {
            setError(err.message || "Erro ao carregar dados")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        fetchCorrections()
    }, [fetchCorrections])

    // Handle delete
    const handleDelete = async (id: string) => {
        if (!confirm("Tem a certeza que deseja eliminar esta picagem manual?")) return

        setError(null)
        setSuccess(null)
        try {
            const res = await fetch(`/api/attendance/corrections/${id}`, {
                method: "DELETE"
            })
            if (!res.ok) throw new Error("Falha ao eliminar correção")
            
            setSuccess("Picagem manual eliminada com sucesso!")
            setCorrections(prev => prev.filter(c => c.id !== id))
        } catch (err: any) {
            setError(err.message || "Erro ao eliminar record")
        }
    }

    // Handle submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!workno || !firstName || !lastName || !date || !time || checktype === "") {
            setError("Por favor, preencha todos os campos obrigatórios.")
            return
        }

        setSubmitting(true)
        try {
            // Construct datetime ISO string
            const datetimeStr = `${date}T${time}:00`
            const checktime = new Date(datetimeStr).toISOString()

            const res = await fetch("/api/attendance/corrections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workno,
                    firstName,
                    lastName,
                    checktime,
                    checktype: Number(checktype),
                    device
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || "Erro ao criar picagem manual")
            }

            setSuccess("Picagem em falta registada com sucesso!")
            
            // Reset fields (except employee details for faster multi-entry)
            setDate("")
            setTime("")
            setChecktype("")
            
            fetchCorrections()
        } catch (err: any) {
            setError(err.message || "Erro ao guardar a picagem")
        } finally {
            setSubmitting(false)
        }
    }

    // Filter corrections by search
    const filteredCorrections = React.useMemo(() => {
        if (!searchTerm) return corrections
        const lower = searchTerm.toLowerCase()
        return corrections.filter(c => 
            c.firstName.toLowerCase().includes(lower) ||
            c.lastName.toLowerCase().includes(lower) ||
            c.workno.toLowerCase().includes(lower) ||
            c.device.toLowerCase().includes(lower)
        )
    }, [corrections, searchTerm])

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Correções de Ponto</h1>
                <p className="text-neutral-500">
                    Registe picagens manuais em falta. Estas serão fundidas dinamicamente nos relatórios mensais e folhas de ponto da plataforma.
                </p>
            </div>

            {/* Notification Alerts */}
            {error && (
                <div className="flex items-center gap-2 p-4 bg-red-500/15 border border-red-500/30 text-red-500 rounded-lg">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="flex items-center gap-2 p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 rounded-lg">
                    <CheckCircle className="h-5 w-5 shrink-0" />
                    <span>{success}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form Card (1 col on large screens) */}
                <div className="lg:col-span-1">
                    <Card className="border-neutral-800 bg-neutral-900/50">
                        <CardHeader>
                            <CardTitle>Adicionar Picagem</CardTitle>
                            <CardDescription>Insira os dados da picagem em falta.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="workno">ID do Colaborador (WorkNo) *</Label>
                                    <Input 
                                        id="workno"
                                        placeholder="Ex: 3"
                                        value={workno}
                                        onChange={e => setWorkno(e.target.value)}
                                        className="bg-neutral-900 border-neutral-800"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">Primeiro Nome *</Label>
                                        <Input 
                                            id="firstName"
                                            placeholder="Ex: Guilherme"
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            className="bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Último Nome *</Label>
                                        <Input 
                                            id="lastName"
                                            placeholder="Ex: Santos"
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            className="bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Data *</Label>
                                        <Input 
                                            id="date"
                                            type="date"
                                            value={date}
                                            onChange={e => setDate(e.target.value)}
                                            className="bg-neutral-900 border-neutral-800 text-white scheme-dark"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="time">Hora (HH:MM) *</Label>
                                        <Input 
                                            id="time"
                                            type="time"
                                            value={time}
                                            onChange={e => setTime(e.target.value)}
                                            className="bg-neutral-900 border-neutral-800 text-white scheme-dark"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="checktype">Tipo de Picagem *</Label>
                                    <Select 
                                        value={checktype} 
                                        onValueChange={setChecktype}
                                    >
                                        <SelectTrigger className="bg-neutral-900 border-neutral-800">
                                            <SelectValue placeholder="Selecione o tipo..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                            {CHECK_TYPES.map(type => (
                                                <SelectItem key={type.value} value={String(type.value)}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="device">Dispositivo (Observações)</Label>
                                    <Input 
                                        id="device"
                                        placeholder="Ex: Manual"
                                        value={device}
                                        onChange={e => setDevice(e.target.value)}
                                        className="bg-neutral-900 border-neutral-800"
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

                {/* Corrections List Table (2 cols on large screens) */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="border-neutral-800 bg-neutral-900/50 min-h-[450px]">
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
                                        className="pl-8 bg-neutral-900 border-neutral-800"
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
                                <div className="text-center py-16 border border-dashed border-neutral-800 rounded-lg">
                                    <Clock className="mx-auto h-8 w-8 text-neutral-600 mb-2" />
                                    <h3 className="font-semibold text-neutral-400">Nenhum registo encontrado</h3>
                                    <p className="text-sm text-neutral-500 mt-1">Insira uma picagem em falta no formulário ao lado.</p>
                                </div>
                            ) : (
                                <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-neutral-950/50">
                                            <TableRow className="border-neutral-800">
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
                                                    <TableRow key={corr.id} className="border-neutral-800 hover:bg-neutral-800/20">
                                                        <TableCell className="font-mono text-xs">{corr.workno}</TableCell>
                                                        <TableCell className="font-medium">{`${corr.firstName} ${corr.lastName}`}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span>{format(dateObj, "dd/MM/yyyy")}</span>
                                                                <span className="text-xs text-neutral-500">{format(dateObj, "HH:mm")}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={typeInfo?.color || "text-neutral-400"}>
                                                                {typeInfo?.label.split(" (")[0] || `Tipo ${corr.checktype}`}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-neutral-400 text-sm">{corr.device}</TableCell>
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
