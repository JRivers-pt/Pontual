"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import {
    Edit3,
    Plus,
    History,
    CheckCircle2,
    AlertCircle,
    Clock,
    User,
    Calendar,
    Save,
    Trash2,
    Shield,
    FileText,
    Search,
    RefreshCw,
    Loader2,
    ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { format, parseISO } from "date-fns"
import { pt } from "date-fns/locale"

interface EmployeeOption {
    id: string
    workno: string
    name: string
}

interface AuditItem {
    id: string
    actorId: string
    actorName?: string | null
    clientId: string
    action: string
    targetWorkno?: string | null
    targetName?: string | null
    oldValue?: string | null
    newValue?: string | null
    description?: string | null
    ipAddress?: string | null
    createdAt: string
}

const COMMON_REASONS = [
    "Esquecimento de picagem",
    "Atestado médico / Consulta",
    "Trabalho externo / Serviço fora",
    "Autorização da Direção / Chefia",
    "Avaria / Falha no terminal biométrico",
    "Troca de turno autorizada",
    "Outro motivo (especificado na nota)"
]

export default function CorrectionsPage() {
    const { data: session } = useSession()
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditItem[]>([])
    const [loadingEmployees, setLoadingEmployees] = useState(true)
    const [loadingAudit, setLoadingAudit] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    // Form state
    const [selectedWorkno, setSelectedWorkno] = useState("")
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date()
        return d.toISOString().split("T")[0]
    })
    const [punchType, setPunchType] = useState<"1" | "2">("1") // 1=Entrada, 2=Saida
    const [punchSlot, setPunchSlot] = useState<"in1" | "out1" | "in2" | "out2">("in1")
    const [punchTime, setPunchTime] = useState("08:30")
    const [reason, setReason] = useState("Esquecimento de picagem")
    const [customReason, setCustomReason] = useState("")

    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Filter audit
    const [auditSearch, setAuditSearch] = useState("")

    // Load employees
    const fetchEmployees = async () => {
        setLoadingEmployees(true)
        try {
            const res = await fetch("/api/employees")
            if (res.ok) {
                const data = await res.json()
                const list = (data.employees || []).map((e: any) => ({
                    id: e.id,
                    workno: e.workno,
                    name: e.name
                }))
                setEmployees(list)
                if (list.length > 0 && !selectedWorkno) {
                    setSelectedWorkno(list[0].workno)
                }
            }
        } catch (e) {
            console.error("Error loading employees:", e)
        } finally {
            setLoadingEmployees(false)
        }
    }

    // Load audit logs
    const fetchAuditLogs = async () => {
        setLoadingAudit(true)
        try {
            const res = await fetch("/api/admin/audit?perPage=50&action=MANUAL_INSERT,CORRECTION,DELETE")
            if (res.ok) {
                const data = await res.json()
                setAuditLogs(data.logs || [])
            }
        } catch (e) {
            console.error("Error loading audit logs:", e)
        } finally {
            setLoadingAudit(false)
        }
    }

    useEffect(() => {
        fetchEmployees()
        fetchAuditLogs()
    }, [])

    const selectedEmployeeObj = employees.find(e => e.workno === selectedWorkno)

    // Handle submit correction
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg(null)
        setSuccessMsg(null)

        if (!selectedWorkno || !selectedDate || !punchTime) {
            setErrorMsg("Selecione o colaborador, a data e a hora da picagem.")
            return
        }

        const finalReason = reason === "Outro motivo (especificado na nota)"
            ? customReason.trim() || "Correção manual de ponto"
            : reason

        const combinedDateTime = `${selectedDate}T${punchTime}:00`
        const slotLabel =
            punchSlot === "in1" ? "Entrada Manhã" :
            punchSlot === "out1" ? "Saída Almoço" :
            punchSlot === "in2" ? "Entrada Tarde" : "Saída Fim"

        const checktypeNum = (punchSlot === "in1" || punchSlot === "in2") ? 1 : 2

        setSubmitting(true)
        try {
            const payload = {
                workno: selectedWorkno,
                employeeName: selectedEmployeeObj ? selectedEmployeeObj.name : null,
                checktime: new Date(combinedDateTime).toISOString(),
                checktype: checktypeNum,
                deviceName: `Correção Manual (${slotLabel})`,
                description: `Correção manual (${slotLabel}): ${finalReason}`
            }

            const res = await fetch("/api/attendance/correction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })

            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || "Erro ao registar correção")
            }

            setSuccessMsg(`Picagem de ${slotLabel} às ${punchTime} registada com sucesso para ${selectedEmployeeObj?.name || selectedWorkno}!`)
            
            // Refresh audit logs
            fetchAuditLogs()

            // Reset custom reason
            setCustomReason("")
        } catch (err: any) {
            setErrorMsg(err.message || "Falha ao gravar a correção.")
        } finally {
            setSubmitting(false)
        }
    }

    // Filtered audit logs
    const filteredAudit = useMemo(() => {
        return auditLogs.filter(log => {
            if (!auditSearch) return true
            const q = auditSearch.toLowerCase()
            return (
                (log.actorName && log.actorName.toLowerCase().includes(q)) ||
                (log.targetName && log.targetName.toLowerCase().includes(q)) ||
                (log.targetWorkno && log.targetWorkno.includes(q)) ||
                (log.description && log.description.toLowerCase().includes(q))
            )
        })
    }, [auditLogs, auditSearch])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Edit3 className="h-8 w-8 text-amber-400" />
                        Correções de Ponto & Inserção Manual
                    </h1>
                    <p className="text-neutral-400 text-sm mt-1">
                        Adicione ou retifique picagens esquecidas com justificação obrigatória e registo no histórico de auditoria.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAuditLogs}
                        className="border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loadingAudit ? "animate-spin text-amber-400" : ""}`} />
                        Atualizar Histórico
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Correction Form */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="bg-neutral-900/80 border-neutral-800 shadow-md backdrop-blur">
                        <CardHeader className="pb-3 border-b border-neutral-800">
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus className="h-5 w-5 text-amber-400" />
                                Registar Correção Manual
                            </CardTitle>
                            <CardDescription className="text-xs text-neutral-400">
                                Todas as alterações ficam identificadas com o seu utilizador (<strong>{session?.user?.name || (session?.user as any)?.username}</strong>).
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4">
                            {errorMsg && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                            {successMsg && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{successMsg}</span>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Employee Picker */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                                        <User className="h-3.5 w-3.5 text-blue-400" />
                                        Colaborador *
                                    </Label>
                                    <Select value={selectedWorkno} onValueChange={setSelectedWorkno}>
                                        <SelectTrigger className="bg-neutral-950 border-neutral-700 text-neutral-200 h-10">
                                            <SelectValue placeholder="Selecione o colaborador" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-neutral-900 border-neutral-700 text-neutral-200 max-h-60">
                                            {employees.map(emp => (
                                                <SelectItem key={emp.workno} value={emp.workno}>
                                                    <span className="font-mono font-bold text-blue-400 mr-2">[{emp.workno}]</span>
                                                    {emp.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Date & Time Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5 text-purple-400" />
                                            Data do Ponto *
                                        </Label>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            onChange={e => setSelectedDate(e.target.value)}
                                            className="bg-neutral-950 border-neutral-700 text-white h-10"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-amber-400" />
                                            Hora (HH:MM) *
                                        </Label>
                                        <Input
                                            type="time"
                                            value={punchTime}
                                            onChange={e => setPunchTime(e.target.value)}
                                            className="bg-neutral-950 border-neutral-700 font-mono text-white text-base h-10"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Slot Picker (4 movements) */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-neutral-300">
                                        Movimento Diário a Corrigir
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("in1")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "in1"
                                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500"
                                                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                                            }`}
                                        >
                                            ☀️ Entr. Manhã
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("out1")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "out1"
                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 ring-1 ring-amber-500"
                                                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                                            }`}
                                        >
                                            🍽️ Saída Almoço
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("in2")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "in2"
                                                    ? "bg-blue-500/20 border-blue-500/50 text-blue-300 ring-1 ring-blue-500"
                                                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                                            }`}
                                        >
                                            ☕ Entr. Tarde
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("out2")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "out2"
                                                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300 ring-1 ring-purple-500"
                                                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                                            }`}
                                        >
                                            🏁 Saída Fim
                                        </button>
                                    </div>
                                </div>

                                {/* Reason Selector */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-cyan-400" />
                                        Motivo / Justificação da Alteração *
                                    </Label>
                                    <Select value={reason} onValueChange={setReason}>
                                        <SelectTrigger className="bg-neutral-950 border-neutral-700 text-neutral-200">
                                            <SelectValue placeholder="Selecione o motivo" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-neutral-900 border-neutral-700 text-neutral-200">
                                            {COMMON_REASONS.map(r => (
                                                <SelectItem key={r} value={r}>
                                                    {r}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {reason === "Outro motivo (especificado na nota)" && (
                                        <Input
                                            placeholder="Descreva o motivo detalhado..."
                                            value={customReason}
                                            onChange={e => setCustomReason(e.target.value)}
                                            className="bg-neutral-950 border-neutral-700 text-white mt-2"
                                            required
                                        />
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-lg shadow-amber-600/20 h-11"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            A gravar e a registar na auditoria...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4 mr-2" />
                                            Gravar Correção de Ponto
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Audit Log Table */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="bg-neutral-900/80 border-neutral-800 shadow-md backdrop-blur">
                        <CardHeader className="pb-3 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                    <History className="h-5 w-5 text-blue-400" />
                                    Registo de Auditoria de Correções
                                </CardTitle>
                                <CardDescription className="text-xs text-neutral-400">
                                    Histórico imutável de todas as retificações de ponto efetuadas na plataforma.
                                </CardDescription>
                            </div>

                            {/* Search Filter */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                                <Input
                                    placeholder="Pesquisar por autor, colaborador..."
                                    value={auditSearch}
                                    onChange={e => setAuditSearch(e.target.value)}
                                    className="pl-8 bg-neutral-950 border-neutral-700 text-white text-xs h-8"
                                />
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-neutral-300">
                                    <thead className="bg-neutral-950/80 text-[11px] uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                                        <tr>
                                            <th className="py-2.5 px-3 font-semibold">Data / Hora</th>
                                            <th className="py-2.5 px-3 font-semibold">Autor (Login)</th>
                                            <th className="py-2.5 px-3 font-semibold">Colaborador</th>
                                            <th className="py-2.5 px-3 font-semibold">Detalhes & Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800/60">
                                        {loadingAudit ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-neutral-400">
                                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-amber-400 mb-2" />
                                                    A carregar histórico de auditoria...
                                                </td>
                                            </tr>
                                        ) : filteredAudit.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-neutral-500">
                                                    <Shield className="h-6 w-6 mx-auto text-neutral-600 mb-2" />
                                                    Nenhum registo de correção encontrado.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAudit.map((log) => {
                                                const createdAtDate = parseISO(log.createdAt)
                                                return (
                                                    <tr key={log.id} className="hover:bg-neutral-800/40 transition-colors">
                                                        {/* Timestamp */}
                                                        <td className="py-2.5 px-3 font-mono text-neutral-400 whitespace-nowrap">
                                                            {format(createdAtDate, "dd/MM/yyyy HH:mm:ss")}
                                                        </td>

                                                        {/* Author */}
                                                        <td className="py-2.5 px-3">
                                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-[11px]">
                                                                {log.actorName || log.actorId}
                                                            </Badge>
                                                        </td>

                                                        {/* Target Employee */}
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-semibold text-white">
                                                                {log.targetName || `Colaborador #${log.targetWorkno || '—'}`}
                                                            </div>
                                                            {log.targetWorkno && (
                                                                <span className="font-mono text-[10px] text-blue-400">
                                                                    #{log.targetWorkno}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Description & Values */}
                                                        <td className="py-2.5 px-3 text-neutral-300">
                                                            <p className="font-medium text-neutral-200 leading-snug">
                                                                {log.description || log.action}
                                                            </p>
                                                        </td>
                                                    </tr>
                                                )
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
