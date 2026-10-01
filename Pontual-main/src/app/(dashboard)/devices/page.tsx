"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import {
    Server,
    Radio,
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Network,
    Cpu,
    Lock,
    ExternalLink,
    Clock,
    Activity
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function DevicesPage() {
    const { data: session } = useSession()
    const [isRefreshing, setIsRefreshing] = React.useState(false)
    const [lastUpdated, setLastUpdated] = React.useState<string>("11:30")

    React.useEffect(() => {
        const updateTime = () => {
            const now = new Date()
            setLastUpdated(now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
        }
        updateTime()
        const timer = setInterval(updateTime, 30000)
        return () => clearInterval(timer)
    }, [])

    const handleRefresh = () => {
        setIsRefreshing(true)
        setTimeout(() => {
            const now = new Date()
            setLastUpdated(now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
            setIsRefreshing(false)
        }, 600)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-xs font-semibold">
                            ● Produção Ativa
                        </Badge>
                        <span className="text-xs text-muted-foreground">ID: cmb-live-oracle-vps</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
                        Equipamentos & Telemetria de Rede
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Colégio Manuel Bernardes (CMB) — Estado dos Terminais Suprema BioEntry W2
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="gap-2 text-xs"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                        {isRefreshing ? "A verificar..." : "Atualizar Telemetria"}
                    </Button>
                </div>
            </div>

            {/* Security Guard Alert */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-foreground">Consola de Telemetria Técnica (Departamento de TI)</div>
                        <div className="text-xs text-muted-foreground">
                            Monitorização em tempo real de hardware, portas TCP e conectividade. Dados de RH e colaboradores protegidos pelo Administrador Master.
                        </div>
                    </div>
                </div>
                <Badge variant="secondary" className="text-xs whitespace-nowrap">
                    Acesso Exclusivo TI
                </Badge>
            </div>

            {/* Hardware Status Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Terminal 1: Portaria Fátima */}
                <Card className="border-emerald-500/30 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs font-mono text-muted-foreground">SN: 544304848</div>
                                <CardTitle className="text-base font-bold text-foreground mt-0.5">Portaria Fátima</CardTitle>
                                <CardDescription className="text-xs">Edifício Principal</CardDescription>
                            </div>
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold text-xs gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                ONLINE
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 text-xs pt-1">
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">IP Local (DHCP):</span>
                            <span className="font-mono font-bold text-foreground">192.168.12.31</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Modo Operação:</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">Device ➔ Server</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Porta TCP:</span>
                            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">51211 (Ativa)</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Servidor Cloud:</span>
                            <span className="font-mono text-muted-foreground">169.58.201.101</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Fluxo de Dados:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Pacotes Recebidos
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Terminal 2: Pré-Escola */}
                <Card className="border-emerald-500/30 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs font-mono text-muted-foreground">SN: 544304847</div>
                                <CardTitle className="text-base font-bold text-foreground mt-0.5">Pré-Escola</CardTitle>
                                <CardDescription className="text-xs">Portaria Norte</CardDescription>
                            </div>
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold text-xs gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                ONLINE
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 text-xs pt-1">
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">IP Local (DHCP):</span>
                            <span className="font-mono font-bold text-foreground">192.168.12.26</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Modo Operação:</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">Device ➔ Server</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Porta TCP:</span>
                            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">51211 (Ativa)</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Servidor Cloud:</span>
                            <span className="font-mono text-muted-foreground">169.58.201.101</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Fluxo de Dados:</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Pacotes Recebidos
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Terminal 3: Parque de Estacionamento */}
                <Card className="border-amber-500/40 shadow-sm relative overflow-hidden bg-amber-500/[0.02]">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs font-mono text-muted-foreground">SN: 544304846</div>
                                <CardTitle className="text-base font-bold text-foreground mt-0.5">Parque Estacionamento</CardTitle>
                                <CardDescription className="text-xs">Portaria Sul</CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold text-xs">
                                PENDENTE IT
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 text-xs pt-1">
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Subrede Local:</span>
                            <span className="font-mono font-bold text-foreground">192.168.12.0/24</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Modo Operação:</span>
                            <span className="font-medium text-amber-600 dark:text-amber-400">Device ➔ Server</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Porta TCP:</span>
                            <span className="font-mono text-amber-600 dark:text-amber-400">51211 (Bloqueada)</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Servidor Cloud:</span>
                            <span className="font-mono text-muted-foreground">169.58.201.101</span>
                        </div>
                        <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Ação TI:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> Abrir Regra na Porta
                            </span>
                        </div>
                    </CardContent>
                </Card>

            </div>

            {/* Cloud Gateway & Infrastructure Details */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        Parâmetros da Infraestrutura Cloud & Rede Local
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Configurações técnicas para o Departamento de Informática do Colégio Manuel Bernardes
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1">
                            <div className="text-muted-foreground flex items-center gap-1.5">
                                <Server className="h-3.5 w-3.5 text-emerald-500" /> Receptor Suprema TCP
                            </div>
                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                0.0.0.0 : 51211 / 51212
                            </div>
                            <div className="text-[11px] text-muted-foreground">Daemon Ativo Permanente na Cloud</div>
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1">
                            <div className="text-muted-foreground flex items-center gap-1.5">
                                <Network className="h-3.5 w-3.5 text-blue-500" /> Gateway da Subrede CMB
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono">
                                192.168.12.254
                            </div>
                            <div className="text-[11px] text-muted-foreground">DNS: 192.168.11.53 / 1.1.1.1</div>
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1">
                            <div className="text-muted-foreground flex items-center gap-1.5">
                                <Radio className="h-3.5 w-3.5 text-emerald-500" /> Pipeline de Ingestão
                            </div>
                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                HTTPS : 443 (REST API)
                            </div>
                            <div className="text-[11px] text-muted-foreground">Status 200 OK • Token CMB Ativo</div>
                        </div>
                    </div>

                    {/* Action box for IT */}
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="space-y-0.5">
                            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                Passo Final Pendente (TI CMB):
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Autorizar a saída <strong>TCP 51211 e 51212</strong> para o IP <strong>169.58.201.101</strong> na porta de switch do <strong>Terminal do Parque (SN: 544304846)</strong>.
                            </div>
                        </div>
                        <Badge className="bg-foreground text-background text-xs font-semibold whitespace-nowrap">
                            Regra: TCP Outbound 51211
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
