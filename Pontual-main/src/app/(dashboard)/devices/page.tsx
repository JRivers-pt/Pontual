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
    Activity,
    ChevronDown,
    ChevronUp,
    Zap,
    HelpCircle,
    BookOpen,
    Wrench,
    Shield,
    Wifi,
    WifiOff,
    MonitorSmartphone,
    Database,
    Globe,
    Cable,
    PlugZap,
    Info,
    Phone,
    Mail,
    AlertTriangle,
    RotateCcw,
    Search,
    FileText,
    Layers,
    ArrowRight
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/* ─── Collapsible Section Component ─── */
function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children, accentColor = "blue" }: {
    title: string
    icon: React.ElementType
    defaultOpen?: boolean
    children: React.ReactNode
    accentColor?: "blue" | "emerald" | "amber" | "purple" | "red"
}) {
    const [open, setOpen] = React.useState(defaultOpen)
    const colors = {
        blue: "text-blue-500",
        emerald: "text-emerald-500",
        amber: "text-amber-500",
        purple: "text-purple-500",
        red: "text-red-500",
    }
    return (
        <div className="rounded-xl border border-border overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
            >
                <div className="flex items-center gap-2.5">
                    <Icon className={`h-4.5 w-4.5 ${colors[accentColor]}`} />
                    <span className="text-sm font-bold text-foreground">{title}</span>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {open && <div className="px-4 pb-5 pt-1 border-t border-border">{children}</div>}
        </div>
    )
}

/* ─── Architecture Diagram (Pure SVG) ─── */
function ArchitectureDiagram() {
    return (
        <div className="w-full overflow-x-auto py-2">
            <svg viewBox="0 0 1100 520" className="w-full min-w-[700px]" xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace" }}>
                <defs>
                    <marker id="arrowGreen" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
                    </marker>
                    <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
                    </marker>
                    <marker id="arrowAmber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
                    </marker>
                </defs>

                {/* ─── ZONE 1: Colégio (Local Network) ─── */}
                <rect x="20" y="20" width="380" height="480" rx="16" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 4" opacity="0.4" />
                <rect x="30" y="10" width="240" height="28" rx="6" fill="#3b82f6" fillOpacity="0.12" />
                <text x="40" y="29" fontSize="11" fontWeight="700" fill="#3b82f6">🏫 REDE LOCAL — COLÉGIO CMB</text>

                {/* Terminal Portaria */}
                <rect x="50" y="60" width="160" height="80" rx="10" fill="#10b981" fillOpacity="0.08" stroke="#10b981" strokeWidth="1.5" />
                <text x="130" y="82" fontSize="10" fontWeight="700" fill="#10b981" textAnchor="middle">📱 PORTARIA FÁTIMA</text>
                <text x="130" y="98" fontSize="9" fill="#888" textAnchor="middle">Suprema BioEntry W2</text>
                <text x="130" y="112" fontSize="9" fontWeight="600" fill="#666" textAnchor="middle">SN: 544304848</text>
                <text x="130" y="128" fontSize="9" fontWeight="700" fill="#10b981" textAnchor="middle">IP: 192.168.12.31</text>

                {/* Terminal Pré-Escola */}
                <rect x="50" y="160" width="160" height="80" rx="10" fill="#10b981" fillOpacity="0.08" stroke="#10b981" strokeWidth="1.5" />
                <text x="130" y="182" fontSize="10" fontWeight="700" fill="#10b981" textAnchor="middle">📱 PRÉ-ESCOLA</text>
                <text x="130" y="198" fontSize="9" fill="#888" textAnchor="middle">Suprema BioEntry W2</text>
                <text x="130" y="212" fontSize="9" fontWeight="600" fill="#666" textAnchor="middle">SN: 544304847</text>
                <text x="130" y="228" fontSize="9" fontWeight="700" fill="#10b981" textAnchor="middle">IP: 192.168.12.26</text>

                {/* Terminal Parque */}
                <rect x="50" y="260" width="160" height="80" rx="10" fill="#f59e0b" fillOpacity="0.08" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
                <text x="130" y="282" fontSize="10" fontWeight="700" fill="#f59e0b" textAnchor="middle">📱 PARQUE ESTAC.</text>
                <text x="130" y="298" fontSize="9" fill="#888" textAnchor="middle">Suprema BioEntry W2</text>
                <text x="130" y="312" fontSize="9" fontWeight="600" fill="#666" textAnchor="middle">SN: 544304846</text>
                <text x="130" y="328" fontSize="9" fontWeight="700" fill="#f59e0b" textAnchor="middle">⚠ PENDENTE FIREWALL</text>

                {/* Switch PoE */}
                <rect x="250" y="150" width="130" height="90" rx="10" fill="#6366f1" fillOpacity="0.06" stroke="#6366f1" strokeWidth="1.5" />
                <text x="315" y="175" fontSize="10" fontWeight="700" fill="#6366f1" textAnchor="middle">🔌 SWITCH PoE</text>
                <text x="315" y="193" fontSize="9" fill="#888" textAnchor="middle">Alimentação + Dados</text>
                <text x="315" y="209" fontSize="9" fill="#888" textAnchor="middle">Subrede: 192.168.12.x</text>
                <text x="315" y="225" fontSize="9" fill="#888" textAnchor="middle">GW: 192.168.12.254</text>

                {/* Arrows: Terminals → Switch */}
                <line x1="210" y1="100" x2="248" y2="175" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
                <line x1="210" y1="200" x2="248" y2="195" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
                <line x1="210" y1="300" x2="248" y2="210" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowAmber)" />

                {/* Firewall */}
                <rect x="270" y="290" width="110" height="60" rx="10" fill="#ef4444" fillOpacity="0.06" stroke="#ef4444" strokeWidth="1.5" />
                <text x="325" y="313" fontSize="10" fontWeight="700" fill="#ef4444" textAnchor="middle">🛡️ FIREWALL</text>
                <text x="325" y="330" fontSize="9" fill="#888" textAnchor="middle">Regras TCP Out</text>
                <text x="325" y="343" fontSize="8.5" fontWeight="600" fill="#ef4444" textAnchor="middle">51211 / 51212</text>

                {/* Arrow: Switch → Firewall */}
                <line x1="315" y1="240" x2="315" y2="288" stroke="#888" strokeWidth="1.2" markerEnd="url(#arrowGreen)" />

                {/* Router / Gateway */}
                <rect x="260" y="385" width="130" height="60" rx="10" fill="#8b5cf6" fillOpacity="0.06" stroke="#8b5cf6" strokeWidth="1.5" />
                <text x="325" y="408" fontSize="10" fontWeight="700" fill="#8b5cf6" textAnchor="middle">🌐 ROUTER / GW</text>
                <text x="325" y="425" fontSize="9" fill="#888" textAnchor="middle">IP Público:</text>
                <text x="325" y="438" fontSize="9" fontWeight="700" fill="#8b5cf6" textAnchor="middle">88.157.91.213</text>

                {/* Arrow: Firewall → Router */}
                <line x1="325" y1="350" x2="325" y2="383" stroke="#888" strokeWidth="1.2" markerEnd="url(#arrowGreen)" />

                {/* ─── ZONE 2: Internet ─── */}
                <rect x="420" y="320" width="100" height="140" rx="50" fill="#f0fdf4" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" />
                <text x="470" y="380" fontSize="26" textAnchor="middle">☁️</text>
                <text x="470" y="405" fontSize="10" fontWeight="700" fill="#10b981" textAnchor="middle">INTERNET</text>
                <text x="470" y="420" fontSize="8.5" fill="#888" textAnchor="middle">TCP/IP</text>
                <text x="470" y="433" fontSize="8.5" fill="#888" textAnchor="middle">Outbound</text>
                <text x="470" y="446" fontSize="8.5" fontWeight="600" fill="#10b981" textAnchor="middle">Port 51211</text>

                {/* Arrow: Router → Internet */}
                <line x1="390" y1="415" x2="418" y2="400" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)" />

                {/* ─── ZONE 3: Cloud VPS ─── */}
                <rect x="540" y="20" width="540" height="480" rx="16" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="6 4" opacity="0.4" />
                <rect x="550" y="10" width="290" height="28" rx="6" fill="#10b981" fillOpacity="0.12" />
                <text x="560" y="29" fontSize="11" fontWeight="700" fill="#10b981">☁️ CLOUD VPS — ORACLE (169.58.201.101)</text>

                {/* TCP Listener */}
                <rect x="570" y="60" width="220" height="90" rx="10" fill="#10b981" fillOpacity="0.06" stroke="#10b981" strokeWidth="1.5" />
                <text x="680" y="82" fontSize="10" fontWeight="700" fill="#10b981" textAnchor="middle">📡 SUPREMA TCP LISTENER</text>
                <text x="680" y="100" fontSize="9" fill="#888" textAnchor="middle">Container Docker: suprema-listener</text>
                <text x="680" y="116" fontSize="9" fontWeight="600" fill="#10b981" textAnchor="middle">Porta 51211 / 51212</text>
                <text x="680" y="132" fontSize="9" fill="#888" textAnchor="middle">Recebe pacotes biométricos dos terminais</text>

                {/* Arrow: Internet → TCP Listener */}
                <line x1="520" y1="390" x2="600" y2="152" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)" />

                {/* MySQL Database */}
                <rect x="570" y="180" width="220" height="80" rx="10" fill="#3b82f6" fillOpacity="0.06" stroke="#3b82f6" strokeWidth="1.5" />
                <text x="680" y="202" fontSize="10" fontWeight="700" fill="#3b82f6" textAnchor="middle">🗄️ MYSQL DATABASE</text>
                <text x="680" y="220" fontSize="9" fill="#888" textAnchor="middle">Container: pontual-mysql</text>
                <text x="680" y="236" fontSize="9" fill="#888" textAnchor="middle">Registos de picagens, templates,</text>
                <text x="680" y="250" fontSize="9" fill="#888" textAnchor="middle">colaboradores, horários</text>

                {/* Arrow: TCP Listener → MySQL */}
                <line x1="680" y1="150" x2="680" y2="178" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
                <text x="700" y="168" fontSize="8" fill="#3b82f6" fontWeight="600">INSERT</text>

                {/* Pontual Agent */}
                <rect x="570" y="290" width="220" height="80" rx="10" fill="#8b5cf6" fillOpacity="0.06" stroke="#8b5cf6" strokeWidth="1.5" />
                <text x="680" y="312" fontSize="10" fontWeight="700" fill="#8b5cf6" textAnchor="middle">⚙️ PONTUAL AGENT</text>
                <text x="680" y="330" fontSize="9" fill="#888" textAnchor="middle">Container: pontual-agent</text>
                <text x="680" y="346" fontSize="9" fill="#888" textAnchor="middle">Poll cada 30s → sincroniza picagens</text>
                <text x="680" y="362" fontSize="9" fontWeight="600" fill="#8b5cf6" textAnchor="middle">Token: pontual_sync_cmb_*</text>

                {/* Arrow: MySQL → Agent */}
                <line x1="680" y1="260" x2="680" y2="288" stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
                <text x="700" y="278" fontSize="8" fill="#8b5cf6" fontWeight="600">POLL</text>

                {/* pontualidade.pt Platform */}
                <rect x="830" y="120" width="230" height="110" rx="12" fill="#10b981" fillOpacity="0.08" stroke="#10b981" strokeWidth="2" />
                <text x="945" y="148" fontSize="11" fontWeight="700" fill="#10b981" textAnchor="middle">🌐 PONTUALIDADE.PT</text>
                <text x="945" y="168" fontSize="9" fill="#888" textAnchor="middle">Next.js App (Vercel)</text>
                <text x="945" y="186" fontSize="9" fill="#888" textAnchor="middle">PostgreSQL (Neon Cloud)</text>
                <text x="945" y="204" fontSize="9" fontWeight="600" fill="#10b981" textAnchor="middle">API: /api/sync/punches</text>
                <text x="945" y="220" fontSize="9" fontWeight="600" fill="#10b981" textAnchor="middle">HTTPS 443 — Status 200 OK</text>

                {/* Arrow: Agent → Pontualidade.pt */}
                <line x1="790" y1="330" x2="860" y2="232" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowGreen)" />
                <text x="845" y="280" fontSize="8" fill="#10b981" fontWeight="700" transform="rotate(-40 845 280)">HTTPS POST</text>

                {/* Dashboard Users */}
                <rect x="830" y="280" width="230" height="110" rx="12" fill="#6366f1" fillOpacity="0.06" stroke="#6366f1" strokeWidth="1.5" />
                <text x="945" y="305" fontSize="10" fontWeight="700" fill="#6366f1" textAnchor="middle">👥 UTILIZADORES DASHBOARD</text>
                <text x="945" y="325" fontSize="9" fill="#888" textAnchor="middle">CMB (Master) — Direção</text>
                <text x="945" y="341" fontSize="9" fill="#888" textAnchor="middle">CMB1 (Direção) · CMB2 (RH)</text>
                <text x="945" y="357" fontSize="9" fill="#888" textAnchor="middle">CMB3 (Secretaria) · CMB4 (Coord.)</text>
                <text x="945" y="373" fontSize="9" fontWeight="600" fill="#3b82f6" textAnchor="middle">CMB_IT (Técnico TI) ← Você está aqui</text>
                <text x="945" y="385" fontSize="8" fill="#888" textAnchor="middle">CMB5 (Reserva)</text>

                {/* Arrow: Platform → Users */}
                <line x1="945" y1="230" x2="945" y2="278" stroke="#6366f1" strokeWidth="1.2" markerEnd="url(#arrowBlue)" />

                {/* Legend */}
                <rect x="570" y="420" width="490" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
                <text x="585" y="440" fontSize="9.5" fontWeight="700" fill="#334155">LEGENDA DO FLUXO DE DADOS:</text>
                <line x1="585" y1="455" x2="620" y2="455" stroke="#10b981" strokeWidth="2" />
                <text x="625" y="459" fontSize="8.5" fill="#666">Fluxo ativo (dados a circular)</text>
                <line x1="780" y1="455" x2="815" y2="455" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
                <text x="820" y="459" fontSize="8.5" fill="#666">Pendente (requer ação TI)</text>
                <text x="585" y="478" fontSize="8.5" fill="#666">① Terminal capta biometria → ② TCP 51211 → ③ VPS recebe → ④ Grava MySQL → ⑤ Agent sincroniza → ⑥ pontualidade.pt exibe</text>
            </svg>
        </div>
    )
}


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
                        Equipamentos &amp; Telemetria de Rede
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
                        Parâmetros da Infraestrutura Cloud &amp; Rede Local
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

            {/* ═══════════════════════════════════════════════════════════════════
                ARCHITECTURE DIAGRAM
            ═══════════════════════════════════════════════════════════════════ */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-500" />
                        Esquema de Arquitetura do Sistema
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Diagrama completo do fluxo de dados: Terminal Biométrico → Cloud → Dashboard. Este é o mapa oficial do sistema Pontualidade instalado no CMB.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ArchitectureDiagram />
                </CardContent>
            </Card>

            {/* ═══════════════════════════════════════════════════════════════════
                COMPREHENSIVE IT DOCUMENTATION (Collapsible Sections)
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                    <BookOpen className="h-5 w-5 text-purple-500" />
                    <h2 className="text-lg font-bold text-foreground">Documentação Técnica &amp; Guia de Manutenção</h2>
                </div>
                <p className="text-xs text-muted-foreground px-1">
                    Toda a informação necessária para o Departamento de Informática gerir, monitorizar e resolver problemas no sistema de assiduidade Pontualidade. Clique em cada secção para expandir.
                </p>

                {/* ── Section 1: How the System Works ── */}
                <CollapsibleSection title="1. Como Funciona o Sistema (Visão Geral)" icon={Zap} defaultOpen={true} accentColor="emerald">
                    <div className="space-y-4 text-sm text-muted-foreground">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h4 className="font-bold text-foreground text-sm">Fluxo de Dados Passo a Passo</h4>
                                <ol className="space-y-2.5 list-none">
                                    {[
                                        { n: "1", text: <><strong className="text-foreground">Colaborador coloca o dedo</strong> no terminal Suprema BioEntry W2 (uma das 3 unidades instaladas no colégio).</> },
                                        { n: "2", text: <><strong className="text-foreground">O terminal valida</strong> a impressão digital localmente (templates guardados na memória interna do equipamento — até 1 milhão de eventos).</> },
                                        { n: "3", text: <><strong className="text-foreground">Modo &quot;Device → Server&quot;:</strong> O terminal inicia uma conexão TCP de saída (outbound) para o IP <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">169.58.201.101</code> na porta <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">51211</code>.</> },
                                        { n: "4", text: <><strong className="text-foreground">O tráfego atravessa</strong> o switch PoE → Firewall CMB → Router → Internet → chega ao VPS Oracle Cloud.</> },
                                        { n: "5", text: <><strong className="text-foreground">O &quot;Suprema TCP Listener&quot;</strong> (container Docker no VPS) recebe o pacote biométrico e grava-o na base de dados MySQL.</> },
                                        { n: "6", text: <><strong className="text-foreground">O &quot;Pontual Agent&quot;</strong> (outro container Docker) verifica a cada 30 segundos se há novas picagens e envia-as via HTTPS POST para <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">www.pontualidade.pt/api/sync/punches</code>.</> },
                                        { n: "7", text: <><strong className="text-foreground">A dashboard pontualidade.pt</strong> mostra a picagem em tempo real para a Direção, RH, Secretaria e demais utilizadores autorizados.</> },
                                    ].map((step) => (
                                        <li key={step.n} className="flex items-start gap-2">
                                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold min-w-[20px] justify-center mt-0.5">{step.n}</Badge>
                                            <span>{step.text}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-foreground text-sm">Conceitos Importantes</h4>
                                <div className="space-y-2">
                                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5"><Shield className="h-3 w-3 text-blue-500" /> Modo Device → Server</div>
                                        <p className="text-xs mt-1">Os terminais NÃO aceitam conexões de entrada. São eles que iniciam a comunicação para fora. Por isso, o BioStar 2 local não consegue &quot;encontrar&quot; os terminais — isto é normal e esperado.</p>
                                    </div>
                                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5"><Database className="h-3 w-3 text-blue-500" /> Memória Interna</div>
                                        <p className="text-xs mt-1">Cada terminal guarda até 1 milhão de eventos internamente. Mesmo se a Internet cair, as picagens ficam guardadas e serão enviadas quando a ligação for restabelecida.</p>
                                    </div>
                                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5"><PlugZap className="h-3 w-3 text-emerald-500" /> Alimentação PoE</div>
                                        <p className="text-xs mt-1">Os terminais são alimentados via PoE (Power over Ethernet). Se um terminal não ligar, verificar primeiro se a porta do switch PoE está ativa e se o cabo Ethernet está bem encaixado.</p>
                                    </div>
                                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                                        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5"><Globe className="h-3 w-3 text-purple-500" /> Zero Manutenção Cloud</div>
                                        <p className="text-xs mt-1">O servidor cloud (VPS Oracle) é gerido remotamente pela Pontualidade. O colégio não precisa de manter, atualizar ou reiniciar nenhum serviço no servidor. Tudo é automático.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 2: Network Topology ── */}
                <CollapsibleSection title="2. Topologia de Rede & Endereçamento IP" icon={Network} accentColor="blue">
                    <div className="space-y-4">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Componente</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Endereço IP</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Portas</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Notas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    <tr><td className="py-2 px-3 font-medium text-foreground">Terminal Portaria Fátima</td><td className="py-2 px-3 font-mono">192.168.12.31</td><td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400">TCP 51211 OUT ✅</td><td className="py-2 px-3 text-muted-foreground">DHCP · SN 544304848</td></tr>
                                    <tr><td className="py-2 px-3 font-medium text-foreground">Terminal Pré-Escola</td><td className="py-2 px-3 font-mono">192.168.12.26</td><td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400">TCP 51211 OUT ✅</td><td className="py-2 px-3 text-muted-foreground">DHCP · SN 544304847</td></tr>
                                    <tr className="bg-amber-500/5"><td className="py-2 px-3 font-medium text-amber-600 dark:text-amber-400">Terminal Parque Estac.</td><td className="py-2 px-3 font-mono">192.168.12.x (DHCP)</td><td className="py-2 px-3 font-mono text-amber-600 dark:text-amber-400">TCP 51211 OUT ⚠️</td><td className="py-2 px-3 text-amber-600 dark:text-amber-400 font-semibold">SN 544304846 · Firewall pendente</td></tr>
                                    <tr><td className="py-2 px-3 font-medium text-foreground">Gateway / Router CMB</td><td className="py-2 px-3 font-mono">192.168.12.254</td><td className="py-2 px-3">—</td><td className="py-2 px-3 text-muted-foreground">Gateway da subrede 192.168.12.0/24</td></tr>
                                    <tr><td className="py-2 px-3 font-medium text-foreground">DNS Interno CMB</td><td className="py-2 px-3 font-mono">192.168.11.53</td><td className="py-2 px-3 font-mono">UDP 53</td><td className="py-2 px-3 text-muted-foreground">DNS primário · Secundário: 1.1.1.1</td></tr>
                                    <tr><td className="py-2 px-3 font-medium text-foreground">IP Público CMB (NAT)</td><td className="py-2 px-3 font-mono font-bold">88.157.91.213</td><td className="py-2 px-3">—</td><td className="py-2 px-3 text-muted-foreground">Endereço visto pelo VPS nos pacotes</td></tr>
                                    <tr className="bg-emerald-500/5"><td className="py-2 px-3 font-medium text-emerald-600 dark:text-emerald-400">VPS Cloud Pontualidade</td><td className="py-2 px-3 font-mono font-bold">169.58.201.101</td><td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400">TCP 51211, 51212</td><td className="py-2 px-3 text-muted-foreground">Oracle Cloud · Gerido por Pontualidade</td></tr>
                                    <tr className="bg-emerald-500/5"><td className="py-2 px-3 font-medium text-foreground">API pontualidade.pt</td><td className="py-2 px-3 font-mono">Vercel Edge Network</td><td className="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400">HTTPS 443</td><td className="py-2 px-3 text-muted-foreground">Dashboard e API de sincronização</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs">
                            <div className="font-bold text-foreground flex items-center gap-1.5 mb-1"><Info className="h-3 w-3 text-blue-500" /> Nota sobre DHCP</div>
                            <p className="text-muted-foreground">Os terminais obtêm IP via DHCP. Se o IP mudar após reinício do equipamento, não há problema — o terminal continua a ligar para o servidor cloud pelo IP fixo <code className="bg-muted px-1 py-0.5 rounded font-mono">169.58.201.101:51211</code>. A comunicação é sempre iniciada pelo terminal (outbound).</p>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 3: Troubleshooting ── */}
                <CollapsibleSection title="3. Resolução de Problemas (Troubleshooting)" icon={Wrench} accentColor="amber">
                    <div className="space-y-5">
                        {/* Problem 1 */}
                        <div className="rounded-lg border border-red-500/20 overflow-hidden">
                            <div className="bg-red-500/5 p-3 flex items-center gap-2">
                                <WifiOff className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-bold text-foreground">Problema: Terminal mostra &quot;OFFLINE&quot; ou não envia picagens</span>
                            </div>
                            <div className="p-4 space-y-3 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground">Diagnóstico passo a passo:</p>
                                <ol className="space-y-2 list-decimal list-inside">
                                    <li><strong className="text-foreground">Verificar alimentação PoE:</strong> O LED do terminal está aceso? Se não, verificar o cabo Ethernet no terminal e na porta do switch PoE. Trocar de porta se necessário.</li>
                                    <li><strong className="text-foreground">Verificar cabo de rede:</strong> Desligar e voltar a ligar o cabo RJ45 em ambas as pontas (terminal e switch). Confirmar que o LED de link no switch pisca.</li>
                                    <li><strong className="text-foreground">Verificar conectividade IP:</strong> De um PC na mesma subrede (192.168.12.x), tentar fazer ping ao IP do terminal:
                                        <div className="mt-1 p-2 bg-muted rounded font-mono">ping 192.168.12.31</div>
                                        <p className="mt-1">Se não responder, o terminal pode não ter obtido IP (ver passo 4).</p>
                                    </li>
                                    <li><strong className="text-foreground">Reiniciar o terminal:</strong> Desligar o cabo PoE, esperar 10 segundos, voltar a ligar. O terminal demora ~30s a arrancar.</li>
                                    <li><strong className="text-foreground">Verificar regra de firewall:</strong> De um PC na subrede 192.168.12.x, testar a conectividade TCP:
                                        <div className="mt-1 p-2 bg-muted rounded font-mono">Test-NetConnection -ComputerName 169.58.201.101 -Port 51211</div>
                                        <p className="mt-1">Se <code className="bg-muted px-1 py-0.5 rounded font-mono">TcpTestSucceeded: True</code> → a firewall está OK.</p>
                                        <p>Se <code className="bg-muted px-1 py-0.5 rounded font-mono">TcpTestSucceeded: False</code> → a regra de firewall para TCP outbound 51211/51212 está em falta nesta porta do switch.</p>
                                    </li>
                                    <li><strong className="text-foreground">Se tudo acima estiver OK</strong> e o terminal continuar sem enviar dados, contactar a Pontualidade (ver contactos abaixo).</li>
                                </ol>
                            </div>
                        </div>

                        {/* Problem 2 */}
                        <div className="rounded-lg border border-amber-500/20 overflow-hidden">
                            <div className="bg-amber-500/5 p-3 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-bold text-foreground">Problema: As picagens aparecem no terminal mas não na dashboard</span>
                            </div>
                            <div className="p-4 space-y-3 text-xs text-muted-foreground">
                                <p>Isto significa que o terminal está a funcionar localmente mas os dados não estão a chegar ao servidor cloud. Possíveis causas:</p>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li><strong className="text-foreground">Firewall a bloquear:</strong> Porta TCP 51211 bloqueada na firewall do colégio para a porta de switch deste terminal.</li>
                                    <li><strong className="text-foreground">Internet do colégio em baixo:</strong> Verificar se há acesso à Internet a partir de um PC na mesma rede.</li>
                                    <li><strong className="text-foreground">Problema temporário:</strong> O terminal guarda as picagens internamente. Quando a ligação for restabelecida, envia tudo automaticamente. Nenhuma picagem se perde.</li>
                                </ul>
                                <div className="p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5">
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">✅ Tranquilização:</span> Mesmo que a Internet falhe durante horas, todas as picagens ficam guardadas na memória não-volátil do terminal e serão sincronizadas automaticamente quando a ligação voltar.
                                </div>
                            </div>
                        </div>

                        {/* Problem 3 */}
                        <div className="rounded-lg border border-blue-500/20 overflow-hidden">
                            <div className="bg-blue-500/5 p-3 flex items-center gap-2">
                                <MonitorSmartphone className="h-4 w-4 text-blue-500" />
                                <span className="text-sm font-bold text-foreground">Problema: BioStar 2 no PC mostra terminais &quot;Desconectado&quot;</span>
                            </div>
                            <div className="p-4 space-y-2 text-xs text-muted-foreground">
                                <div className="p-2.5 rounded border border-blue-500/20 bg-blue-500/5">
                                    <span className="font-semibold text-blue-500">ℹ️ Isto é NORMAL e esperado.</span>
                                </div>
                                <p>No modo <strong className="text-foreground">&quot;Device → Server&quot;</strong>, os terminais não aceitam conexões de entrada (inbound). O BioStar 2 tenta conectar-se aos terminais mas estes recusam — este é o comportamento correto.</p>
                                <p>A gestão dos terminais é feita remotamente pelo servidor cloud. O BioStar 2 local <strong>não é necessário</strong> para o funcionamento diário do sistema.</p>
                            </div>
                        </div>

                        {/* Problem 4 */}
                        <div className="rounded-lg border border-purple-500/20 overflow-hidden">
                            <div className="bg-purple-500/5 p-3 flex items-center gap-2">
                                <RotateCcw className="h-4 w-4 text-purple-500" />
                                <span className="text-sm font-bold text-foreground">Problema: Um colaborador não consegue picar o ponto</span>
                            </div>
                            <div className="p-4 space-y-2 text-xs text-muted-foreground">
                                <p>Se o terminal acende o LED vermelho e rejeita a impressão digital:</p>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li><strong className="text-foreground">Dedo sujo ou molhado:</strong> Pedir ao colaborador que limpe e seque o dedo.</li>
                                    <li><strong className="text-foreground">Template corrompido:</strong> A impressão digital do colaborador pode precisar de ser recolhida novamente. Contactar a administração (conta CMB Master) para re-inscrição.</li>
                                    <li><strong className="text-foreground">Colaborador não inscrito:</strong> Apenas colaboradores com templates biométricos registados podem picar o ponto. Novos funcionários precisam de ser inscritos pelo administrador.</li>
                                </ul>
                                <p className="italic">Nota: Esta situação NÃO é da responsabilidade do TI. Encaminhar para a Direção/RH.</p>
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 4: Firewall Rule Instructions ── */}
                <CollapsibleSection title="4. Regra de Firewall — Instruções Detalhadas" icon={Shield} accentColor="red">
                    <div className="space-y-4 text-xs">
                        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                            <div className="font-bold text-foreground flex items-center gap-1.5 mb-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                Ação necessária para o Terminal do Parque de Estacionamento (SN: 544304846)
                            </div>
                            <p className="text-muted-foreground mb-3">
                                O terceiro terminal ainda não comunica com o servidor cloud porque a regra de firewall TCP outbound não foi aplicada à porta de switch onde este terminal está ligado.
                            </p>
                        </div>

                        <h4 className="font-bold text-foreground text-sm">Regra a Criar / Duplicar:</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse border border-border rounded-lg overflow-hidden">
                                <tbody className="divide-y divide-border">
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50 w-1/3">Tipo de Regra</td><td className="py-2.5 px-3 font-mono">TCP Outbound (Saída)</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">Portas de Destino</td><td className="py-2.5 px-3 font-mono font-bold text-red-600 dark:text-red-400">51211, 51212</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">IP de Destino</td><td className="py-2.5 px-3 font-mono font-bold text-red-600 dark:text-red-400">169.58.201.101</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">Aplicar a</td><td className="py-2.5 px-3">Porta do switch onde o terminal do Parque (SN 544304846) está ligado</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">Protocolo</td><td className="py-2.5 px-3 font-mono">TCP</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">Ação</td><td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">PERMITIR (ALLOW)</td></tr>
                                    <tr><td className="py-2.5 px-3 font-semibold text-foreground bg-muted/50">Referência</td><td className="py-2.5 px-3 text-muted-foreground">Duplicar a mesma regra já aplicada às portas dos terminais da Portaria e Pré-Escola</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <h4 className="font-bold text-foreground text-sm mt-4">Como Verificar (após aplicar a regra):</h4>
                        <div className="p-3 bg-muted rounded-lg font-mono space-y-1">
                            <p className="text-muted-foreground"># Executar num PC da subrede 192.168.12.x:</p>
                            <p className="text-foreground">Test-NetConnection -ComputerName 169.58.201.101 -Port 51211</p>
                            <p className="text-muted-foreground mt-2"># Resultado esperado:</p>
                            <p className="text-emerald-600 dark:text-emerald-400">TcpTestSucceeded : True</p>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 5: Accounts & Permissions ── */}
                <CollapsibleSection title="5. Contas de Acesso & Permissões da Dashboard" icon={Lock} accentColor="purple">
                    <div className="space-y-4 text-xs">
                        <p className="text-muted-foreground">O sistema pontualidade.pt utiliza um modelo de contas hierárquico. A conta Master (CMB) controla todas as sub-contas.</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Utilizador</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Função</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Acesso Colaboradores</th>
                                        <th className="text-left py-2 px-3 font-bold text-foreground bg-muted/50">Acesso Equipamentos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB</td><td className="py-2 px-3">Master (Administrador)</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Total</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB1</td><td className="py-2 px-3">Direção</td><td className="py-2 px-3 text-muted-foreground">Dashboard + Relatórios</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB2</td><td className="py-2 px-3">Recursos Humanos</td><td className="py-2 px-3 text-muted-foreground">Dashboard + Relatórios</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB3</td><td className="py-2 px-3">Secretaria</td><td className="py-2 px-3 text-muted-foreground">Dashboard + Relatórios</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB4</td><td className="py-2 px-3">Coordenação</td><td className="py-2 px-3 text-muted-foreground">Dashboard + Relatórios</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                    <tr className="bg-blue-500/5"><td className="py-2 px-3 font-bold text-blue-500">CMB_IT</td><td className="py-2 px-3 font-semibold text-blue-500">Técnico de Informática</td><td className="py-2 px-3 text-red-500 font-semibold">🔒 Sem acesso</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-bold">✅ Esta página</td></tr>
                                    <tr><td className="py-2 px-3 font-semibold text-foreground">CMB5</td><td className="py-2 px-3">Reserva</td><td className="py-2 px-3 text-muted-foreground">Dashboard + Relatórios</td><td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">✅ Sim</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                            <div className="font-bold text-foreground flex items-center gap-1.5 mb-1"><Info className="h-3 w-3 text-blue-500" /> Nota de Segurança</div>
                            <p className="text-muted-foreground">A conta <strong>CMB_IT</strong> foi propositadamente configurada sem acesso a dados de colaboradores, horários ou picagens individuais. O técnico de TI tem acesso apenas à telemetria de rede e equipamentos — esta página.</p>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 6: Docker Infrastructure ── */}
                <CollapsibleSection title="6. Infraestrutura Cloud (Detalhes Técnicos)" icon={Server} accentColor="emerald">
                    <div className="space-y-4 text-xs">
                        <p className="text-muted-foreground">O servidor cloud é composto por 3 containers Docker que correm automaticamente 24/7. <strong className="text-foreground">O TI do colégio não precisa de aceder ao servidor.</strong> Esta secção é apenas informativa.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                                <div className="font-bold text-foreground flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-emerald-500" /> suprema-listener</div>
                                <p className="text-muted-foreground">Recebe pacotes TCP dos terminais Suprema nas portas 51211 e 51212. Descodifica o protocolo proprietário Suprema e grava os eventos na base de dados.</p>
                                <div className="font-mono text-[11px] text-muted-foreground">Node.js · Portas: 51211, 51212</div>
                            </div>
                            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                                <div className="font-bold text-foreground flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-blue-500" /> pontual-mysql</div>
                                <p className="text-muted-foreground">Base de dados MySQL que armazena todos os registos de picagens, templates biométricos, horários e configurações dos terminais.</p>
                                <div className="font-mono text-[11px] text-muted-foreground">MySQL 8.0 · Porta: 3306 (local)</div>
                            </div>
                            <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-2">
                                <div className="font-bold text-foreground flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-purple-500" /> pontual-agent</div>
                                <p className="text-muted-foreground">Agente de sincronização que verifica novos registos na MySQL a cada 30 segundos e envia-os via HTTPS POST para a API pontualidade.pt.</p>
                                <div className="font-mono text-[11px] text-muted-foreground">Node.js · Poll: 30s · API: /api/sync/punches</div>
                            </div>
                        </div>
                        <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                            <div className="font-bold text-foreground flex items-center gap-1.5 mb-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Auto-Recovery</div>
                            <p className="text-muted-foreground">Todos os containers estão configurados com <code className="bg-muted px-1 py-0.5 rounded font-mono">restart: always</code>. Se o servidor reiniciar por qualquer motivo, os 3 serviços arrancam automaticamente sem intervenção humana.</p>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ── Section 7: FAQ ── */}
                <CollapsibleSection title="7. Perguntas Frequentes (FAQ)" icon={HelpCircle} accentColor="blue">
                    <div className="space-y-3 text-xs">
                        {[
                            { q: "Preciso de manter o BioStar 2 instalado no PC?", a: "Não. O BioStar 2 local não é necessário para o funcionamento diário. O sistema funciona inteiramente na cloud. O BioStar 2 pode ser útil apenas para configuração inicial de terminais novos, mas essa operação é feita pela Pontualidade." },
                            { q: "O que acontece se a Internet do colégio cair?", a: "Os terminais continuam a funcionar normalmente. As picagens ficam guardadas na memória interna (não-volátil) de cada terminal. Quando a Internet voltar, todos os registos são enviados automaticamente para o servidor cloud. Nenhuma picagem se perde." },
                            { q: "E se o servidor cloud ficar em baixo?", a: "O servidor cloud tem uptime de 99.9% (Oracle Cloud). Se por algum motivo ficar offline, os terminais guardam as picagens localmente e enviam quando o servidor voltar. A Pontualidade monitoriza o servidor 24/7." },
                            { q: "Posso ver os dados dos colaboradores nesta conta de TI?", a: "Não. A conta CMB_IT foi configurada propositadamente sem acesso a dados pessoais (RGPD). O TI tem acesso apenas a esta página de telemetria de rede e equipamentos." },
                            { q: "Preciso de abrir alguma porta de entrada (inbound) na firewall?", a: "Não. Os terminais funcionam em modo 'Device → Server', ou seja, iniciam conexões de SAÍDA (outbound). Não é necessário abrir nenhuma porta de entrada. Apenas a saída TCP 51211/51212 para o IP 169.58.201.101 precisa de estar permitida." },
                            { q: "Como adiciono um novo colaborador ao sistema?", a: "A adição de colaboradores e recolha de impressões digitais é feita pela Direção/RH através da conta CMB Master, ou pela Pontualidade remotamente. O TI não precisa de intervir neste processo." },
                            { q: "Posso mudar o IP dos terminais para IP fixo?", a: "Não é recomendado nem necessário. Os terminais funcionam perfeitamente com DHCP. A comunicação é sempre iniciada pelo terminal para o IP fixo do servidor cloud, independentemente do IP local atribuído." },
                            { q: "Quanto tempo demora uma picagem a aparecer na dashboard?", a: "Em condições normais, menos de 60 segundos: o terminal envia imediatamente via TCP, o listener grava na MySQL, e o agent sincroniza a cada 30 segundos com a API pontualidade.pt." },
                        ].map((faq, i) => (
                            <div key={i} className="p-3 rounded-lg border border-border">
                                <div className="font-bold text-foreground flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">Q:</span>
                                    {faq.q}
                                </div>
                                <div className="mt-1.5 text-muted-foreground flex items-start gap-2">
                                    <span className="text-emerald-500 mt-0.5 font-bold">A:</span>
                                    {faq.a}
                                </div>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>

                {/* ── Section 8: Contacts ── */}
                <CollapsibleSection title="8. Contactos & Suporte" icon={Phone} accentColor="emerald">
                    <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2.5">
                                <div className="font-bold text-foreground text-sm">Suporte Técnico — Pontualidade</div>
                                <div className="space-y-1.5 text-muted-foreground">
                                    <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-emerald-500" /> <span className="font-mono">www.pontualidade.pt</span></div>
                                    <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-emerald-500" /> <span className="font-mono">suporte@pontualidade.pt</span></div>
                                </div>
                                <div className="mt-2 text-muted-foreground">
                                    <p className="font-semibold text-foreground mb-1">Quando contactar:</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        <li>Problemas que persistam após seguir o troubleshooting acima</li>
                                        <li>Necessidade de adicionar/remover terminais</li>
                                        <li>Alterações à configuração do sistema</li>
                                        <li>Dúvidas sobre a plataforma</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2.5">
                                <div className="font-bold text-foreground text-sm">Matriz de Escalação</div>
                                <div className="space-y-2 text-muted-foreground">
                                    <div className="flex items-start gap-2">
                                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold min-w-[40px] justify-center mt-0.5">Nível 1</Badge>
                                        <span><strong className="text-foreground">TI CMB:</strong> Verificar cabos, PoE, conectividade, regras de firewall (este guia)</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-bold min-w-[40px] justify-center mt-0.5">Nível 2</Badge>
                                        <span><strong className="text-foreground">Pontualidade:</strong> Problemas no servidor cloud, base de dados, agente de sincronização, API</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[10px] font-bold min-w-[40px] justify-center mt-0.5">Nível 3</Badge>
                                        <span><strong className="text-foreground">Direção/RH (CMB Master):</strong> Gestão de colaboradores, horários, templates biométricos</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center text-muted-foreground">
                            <p className="text-[11px]">Última atualização desta documentação: Outubro 2026 · Versão do sistema: Pontualidade Cloud v2.0 · Terminais: Suprema BioEntry W2</p>
                        </div>
                    </div>
                </CollapsibleSection>
            </div>

            {/* Footer spacer */}
            <div className="h-4" />
        </div>
    )
}
