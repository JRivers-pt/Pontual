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
    ArrowRight,
    UserCheck
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
    const [manualWorkno, setManualWorkno] = useState("")
    const [manualName, setManualName] = useState("")
    const [isManualInput, setIsManualInput] = useState(false)

    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date()
        return d.toISOString().split("T")[0]
    })
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
                if (list.length > 0) {
                    if (!selectedWorkno) {
                        setSelectedWorkno(list[0].workno)
                    }
                    setIsManualInput(false)
                } else {
                    setIsManualInput(true)
                }
            } else {
                setIsManualInput(true)
            }
        } catch (e) {
            console.error("Error loading employees:", e)
            setIsManualInput(true)
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

        const finalWorkno = isManualInput ? manualWorkno.trim() : selectedWorkno
        const finalEmployeeName = isManualInput
            ? manualName.trim()
            : (selectedEmployeeObj ? selectedEmployeeObj.name : `Colaborador ${finalWorkno}`)

        if (!finalWorkno) {
            setErrorMsg("Por favor, indique o ID / Nº Mecanográfico do colaborador.")
            return
        }
        if (!selectedDate || !punchTime) {
            setErrorMsg("Selecione a data e a hora da picagem.")
            return
        }

        const finalReason = reason === "Outro motivo (especificado na nota)"
            ? customReason.trim() || "Correção manual de ponto"
            : reason

        // Avoid local-to-UTC shift by passing exact timestamp as UTC literal
        const combinedDateTime = `${selectedDate}T${punchTime}:00.000Z`
        const slotLabel =
            punchSlot === "in1" ? "Entrada Manhã" :
            punchSlot === "out1" ? "Saída Almoço" :
            punchSlot === "in2" ? "Entrada Tarde" : "Saída Fim"

        // Map movement slots to unified types:
        // in1: 0 (Entrada)
        // out1: 2 (Início Pausa / Saída Almoço)
        // in2: 3 (Fim Pausa / Entrada Tarde)
        // out2: 1 (Saída Fim)
        const checktypeNum =
            punchSlot === "in1" ? 0 :
            punchSlot === "out1" ? 2 :
            punchSlot === "in2" ? 3 : 1

        setSubmitting(true)
        try {
            const payload = {
                workno: finalWorkno,
                employeeName: finalEmployeeName,
                checktime: combinedDateTime,
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

            setSuccessMsg(`Picagem de ${slotLabel} às ${punchTime} gravada com sucesso para ${finalEmployeeName}!`)
            
            // Refresh audit logs
            fetchAuditLogs()

            // Reset custom reason
            setCustomReason("")
            if (isManualInput && employees.length > 0) {
                setManualWorkno("")
                setManualName("")
            }
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
        <div className="p-8 space-y-6 bg-neutral-50/50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 flex items-center gap-3">
                        <Edit3 className="h-8 w-8 text-blue-600" />
                        Correções de Ponto & Inserção Manual
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
                        Adicione ou retifique picagens esquecidas com justificação obrigatória e registo no histórico de auditoria.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchAuditLogs}
                        className="border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 shadow-sm"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loadingAudit ? "animate-spin text-blue-600" : ""}`} />
                        Atualizar Histórico
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Correction Form */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-xl">
                        <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-800">
                            <CardTitle className="text-base font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
                                <Plus className="h-5 w-5 text-blue-600" />
                                Registar Correção Manual
                            </CardTitle>
                            <CardDescription className="text-xs text-neutral-500">
                                Todas as alterações ficam identificadas com o seu utilizador (<strong>{session?.user?.name || (session?.user as any)?.username}</strong>).
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4">
                            {errorMsg && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}
                            {successMsg && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    <span>{successMsg}</span>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Employee Picker / Manual Switch */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-blue-600" />
                                            Colaborador *
                                        </Label>
                                        {employees.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setIsManualInput(!isManualInput)}
                                                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium hover:underline"
                                            >
                                                {isManualInput ? "Selecionar da lista" : "Introduzir manualmente"}
                                            </button>
                                        )}
                                    </div>

                                    {!isManualInput && employees.length > 0 ? (
                                        <Select value={selectedWorkno} onValueChange={setSelectedWorkno}>
                                            <SelectTrigger className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 h-10">
                                                <SelectValue placeholder="Selecione o colaborador" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 max-h-60">
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.workno} value={emp.workno}>
                                                        <span className="font-mono font-bold text-blue-600 mr-2">[{emp.workno}]</span>
                                                        {emp.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="col-span-1">
                                                <Input
                                                    placeholder="ID / Nº"
                                                    value={manualWorkno}
                                                    onChange={e => setManualWorkno(e.target.value)}
                                                    className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 font-mono text-sm h-10"
                                                    required
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <Input
                                                    placeholder="Nome do Colaborador"
                                                    value={manualName}
                                                    onChange={e => setManualName(e.target.value)}
                                                    className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-sm h-10"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Date & Time Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                                            Data do Ponto *
                                        </Label>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            onChange={e => setSelectedDate(e.target.value)}
                                            className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 h-10"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-blue-600" />
                                            Hora (HH:MM) *
                                        </Label>
                                        <Input
                                            type="time"
                                            value={punchTime}
                                            onChange={e => setPunchTime(e.target.value)}
                                            className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 font-mono text-neutral-900 dark:text-neutral-100 text-base h-10"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Slot Picker (4 movements) */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                                        Movimento Diário a Corrigir
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("in1")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "in1"
                                                    ? "bg-emerald-50 border-emerald-400 text-emerald-800 ring-1 ring-emerald-400"
                                                    : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                                            }`}
                                        >
                                            ☀️ Entr. Manhã
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("out1")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "out1"
                                                    ? "bg-amber-50 border-amber-400 text-amber-800 ring-1 ring-amber-400"
                                                    : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                                            }`}
                                        >
                                            🍽️ Saída Almoço
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("in2")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "in2"
                                                    ? "bg-blue-50 border-blue-400 text-blue-800 ring-1 ring-blue-400"
                                                    : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                                            }`}
                                        >
                                            ☕ Entr. Tarde
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPunchSlot("out2")}
                                            className={`p-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                                                punchSlot === "out2"
                                                    ? "bg-purple-50 border-purple-400 text-purple-800 ring-1 ring-purple-400"
                                                    : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                                            }`}
                                        >
                                            🏁 Saída Fim
                                        </button>
                                    </div>
                                </div>

                                {/* Reason Selector */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                                        Motivo / Justificação da Alteração *
                                    </Label>
                                    <Select value={reason} onValueChange={setReason}>
                                        <SelectTrigger className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
                                            <SelectValue placeholder="Selecione o motivo" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
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
                                            className="bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 mt-2"
                                            required
                                        />
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm h-11"
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
                    <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm rounded-xl">
                        <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-base font-bold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
                                    <History className="h-5 w-5 text-blue-600" />
                                    Registo de Auditoria de Correções
                                </CardTitle>
                                <CardDescription className="text-xs text-neutral-500">
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
                                    className="pl-8 bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-xs h-8"
                                />
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-neutral-700 dark:text-neutral-300">
                                    <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                                        <tr>
                                            <th className="py-2.5 px-3 font-semibold">Data / Hora</th>
                                            <th className="py-2.5 px-3 font-semibold">Autor (Login)</th>
                                            <th className="py-2.5 px-3 font-semibold">Colaborador</th>
                                            <th className="py-2.5 px-3 font-semibold">Detalhes & Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                        {loadingAudit ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-neutral-500">
                                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600 mb-2" />
                                                    A carregar histórico de auditoria...
                                                </td>
                                            </tr>
                                        ) : filteredAudit.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-neutral-500">
                                                    <Shield className="h-6 w-6 mx-auto text-neutral-400 mb-2" />
                                                    Nenhum registo de correção encontrado.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAudit.map((log) => {
                                                const createdAtDate = parseISO(log.createdAt)
                                                return (
                                                    <tr key={log.id} className="hover:bg-neutral-50/80 transition-colors">
                                                        {/* Timestamp */}
                                                        <td className="py-2.5 px-3 font-mono text-neutral-500 whitespace-nowrap">
                                                            {format(createdAtDate, "dd/MM/yyyy HH:mm:ss")}
                                                        </td>

                                                        {/* Author */}
                                                        <td className="py-2.5 px-3">
                                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px]">
                                                                {log.actorName || log.actorId}
                                                            </Badge>
                                                        </td>

                                                        {/* Target Employee */}
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                                                                {log.targetName || `Colaborador #${log.targetWorkno || '—'}`}
                                                            </div>
                                                            {log.targetWorkno && (
                                                                <span className="font-mono text-[10px] text-blue-600">
                                                                    #{log.targetWorkno}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Description & Values */}
                                                        <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-300">
                                                            <p className="font-medium text-neutral-800 dark:text-neutral-200 leading-snug">
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
