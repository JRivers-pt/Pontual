"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    LayoutDashboard,
    FileText,
    ClipboardList,
    Users,
    Settings,
    Menu,
    Clock,
    LogOut,
    HelpCircle,
    Building2,
    ExternalLink
} from "lucide-react"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname()
    const { data: session } = useSession()

    const companyName = (session?.user as any)?.company ?? null
    const userName = session?.user?.name ?? "Utilizador"

    // Generate initials from company name or user name
    const initials = companyName
        ? companyName.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("")
        : userName.split(" ").slice(0, 2).map((w: string) => w[0].toUpperCase()).join("")

    const allRoutes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/",
            active: pathname === "/",
        },
        {
            label: "Relatórios",
            icon: FileText,
            href: "/reports",
            active: pathname === "/reports",
        },
        {
            label: "Folha de Ponto",
            icon: ClipboardList,
            href: "/timesheet",
            active: pathname === "/timesheet",
        },
        {
            label: "Correções de Ponto",
            icon: Clock,
            href: "/timesheet/corrections",
            active: pathname === "/timesheet/corrections",
        },
    ]

    // Add Admin routes
    if ((session?.user as any)?.role === "ADMIN") {
        allRoutes.push({
            label: "Gestão de Horários",
            icon: Clock,
            href: "/schedules",
            active: pathname === "/schedules",
        })
        allRoutes.push({
            label: "Gestão de Clientes",
            icon: Users,
            href: "/admin/clients",
            active: pathname.startsWith("/admin"),
        })
    }

    return (
        <div className={cn("pb-6 bg-neutral-900 text-white min-h-screen border-r border-neutral-800 flex flex-col justify-between select-none", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    
                    {/* Platform Logo + iFlow Ecosystem Badge */}
                    <div className="px-3 mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 text-white">
                                <Clock className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold text-white tracking-tight leading-none">Pontualidade</h2>
                                <a 
                                    href="https://iflow.pt" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors mt-0.5"
                                    title="Conhecer o ecossistema iFlow.pt"
                                >
                                    <span>by</span>
                                    <span className="font-bold underline decoration-cyan-400/40 underline-offset-2">iFlow.pt</span>
                                    <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Company Badge */}
                    {companyName && (
                        <div className="mx-3 mb-5 flex items-center gap-2 px-3 py-2 bg-blue-950/60 border border-blue-800/40 rounded-xl">
                            <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-blue-200 font-semibold leading-tight truncate">
                                    {companyName}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Navigation Menu */}
                    <div className="space-y-1">
                        {allRoutes.map((route) => (
                            <Button
                                key={route.href}
                                variant={route.active ? "secondary" : "ghost"}
                                className={cn(
                                    "w-full justify-start text-sm font-medium transition-colors rounded-xl",
                                    route.active
                                        ? "bg-neutral-800 text-white hover:bg-neutral-700 hover:text-white"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-800",
                                    (route as any).disabled && "opacity-50 cursor-not-allowed"
                                )}
                                asChild={!(route as any).disabled}
                            >
                                {(route as any).disabled ? (
                                    <span className="flex items-center">
                                        <route.icon className="mr-2 h-4 w-4" />
                                        {route.label}
                                    </span>
                                ) : (
                                    <Link href={route.href}>
                                        <route.icon className="mr-2 h-4 w-4" />
                                        {route.label}
                                    </Link>
                                )}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Section: User Profile & Footer */}
            <div className="px-3 space-y-3">

                {/* User Profile */}
                <div className="flex items-center gap-3 p-2.5 bg-neutral-800/60 rounded-xl border border-neutral-800">
                    <Avatar className="h-8 w-8 border border-neutral-700">
                        <AvatarImage src="/avatars/01.png" alt={`@${userName}`} />
                        <AvatarFallback className="bg-blue-600 text-white text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-xs min-w-0">
                        <span className="font-semibold truncate text-white">{userName}</span>
                        {companyName && (
                            <span className="text-[10px] text-neutral-400 truncate">{companyName}</span>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-7 w-7 text-neutral-400 hover:text-white hover:bg-red-500/20 shrink-0"
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        title="Terminar Sessão"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Footer Brand Credit */}
                <div className="text-center pt-1">
                    <a
                        href="https://iflow.pt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-neutral-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1"
                    >
                        <span>Desenvolvido &amp; Suportado por</span>
                        <strong className="text-neutral-200 hover:text-cyan-300">iFlow.pt</strong>
                    </a>
                </div>
            </div>
        </div>
    )
}

// Mobile Navigation
export function MobileNav() {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" className="md:hidden">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-neutral-900 border-neutral-800">
                <Sidebar className="w-full border-none" />
            </SheetContent>
        </Sheet>
    )
}
