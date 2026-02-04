"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    LayoutDashboard,
    FileText,
    Users,
    Settings,
    Menu,
    Clock,
    LogOut,
    HelpCircle
} from "lucide-react"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname()

    const routes = [
        {
            label: "Visão Geral",
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
            label: "Funcionários",
            icon: Users,
            href: "/employees",
            active: pathname === "/employees",
            disabled: true // Future
        },
        {
            label: "Definições",
            icon: Settings,
            href: "/settings",
            active: pathname === "/settings",
            disabled: true // Future
        },
    ]

    return (
        <div className={cn("pb-12 bg-neutral-900 text-white min-h-screen border-r border-neutral-800", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <div className="flex items-center gap-2 px-4 mb-10">
                        <div className="p-1 bg-blue-600 rounded-lg">
                            <Clock className="h-6 w-6 text-white" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Pontualidade | <span className="text-blue-400">VE</span></h2>
                    </div>
                    <div className="space-y-1">
                        {routes.map((route) => (
                            <Button
                                key={route.href}
                                variant={route.active ? "secondary" : "ghost"}
                                className={cn(
                                    "w-full justify-start text-sm font-medium transition-colors",
                                    route.active
                                        ? "bg-neutral-800 text-white hover:bg-neutral-700 hover:text-white"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-800",
                                    route.disabled && "opacity-50 cursor-not-allowed"
                                )}
                                asChild={!route.disabled}
                            >
                                {route.disabled ? (
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

            {/* Footer / User Profile */}
            <div className="absolute bottom-4 left-0 w-full px-4">
                <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl border border-neutral-800">
                    <Avatar className="h-9 w-9 border border-neutral-700">
                        <AvatarImage src="/avatars/01.png" alt="@admin" />
                        <AvatarFallback className="bg-blue-600 text-white">AD</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-sm">
                        <span className="font-semibold">Admin</span>
                        <span className="text-xs text-neutral-400 truncate w-32">admin@exemplo.com</span>
                    </div>
                    <Button variant="ghost" size="icon" className="ml-auto text-neutral-400 hover:text-white">
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
                <div className="mt-2 text-center">
                    <Button variant="link" className="text-xs text-neutral-500 hover:text-neutral-300 p-0 h-auto">
                        <HelpCircle className="mr-1 h-3 w-3" />
                        Ajuda e Suporte
                    </Button>
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
