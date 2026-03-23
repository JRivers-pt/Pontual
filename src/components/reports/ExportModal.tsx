"use client"

import * as React from "react"
import { FileText, Table as TableIcon, FileBarChart, Download, Loader2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ReportType = "summary" | "detailed" | "matrix" | "mensal"

interface ExportModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onExport: (type: ReportType, format: "pdf" | "excel") => Promise<void>
    loading?: boolean
    title?: string
}

export function ExportModal({ isOpen, onOpenChange, onExport, loading, title }: ExportModalProps) {
    const [selectedType, setSelectedType] = React.useState<ReportType>("summary")
    const [exportFormat, setExportFormat] = React.useState<"pdf" | "excel">("pdf")

    const handleExport = async () => {
        await onExport(selectedType, exportFormat)
        onOpenChange(false)
    }

    const options = [
        {
            id: "summary",
            title: "Resumo Geral",
            description: "Vista compacta com uma linha por dia para todos os colaboradores.",
            icon: FileBarChart,
            color: "text-blue-600",
            bgColor: "bg-blue-50"
        },
        {
            id: "detailed",
            title: "Relatório Detalhado",
            description: "Uma página por colaborador com todos os movimentos e áreas de assinatura.",
            icon: FileText,
            color: "text-purple-600",
            bgColor: "bg-purple-50"
        },
        {
            id: "matrix",
            title: "Resumo em Grelha",
            description: "Matriz horizontal (Mapa de Férias) com horas diárias em formato 24h.",
            icon: TableIcon,
            color: "text-green-600",
            bgColor: "bg-green-50"
        },
        {
            id: "mensal",
            title: "Mensal (Resumo)",
            description: "Relatório ultra-simplificado com foco em totais mensais (Less is more).",
            icon: Download,
            color: "text-orange-600",
            bgColor: "bg-orange-50"
        }
    ]

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Exportar Relatório</DialogTitle>
                    <DialogDescription>
                        Selecione o tipo de relatório que deseja gerar para {title || "o período selecionado"}.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {options.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => setSelectedType(option.id as ReportType)}
                            className={cn(
                                "flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all hover:border-blue-200 hover:bg-neutral-50",
                                selectedType === option.id 
                                    ? "border-blue-500 bg-blue-50/50" 
                                    : "border-transparent bg-white dark:bg-neutral-900 shadow-sm"
                            )}
                        >
                            <div className={cn("p-2 rounded-lg", option.bgColor)}>
                                <option.icon className={cn("h-6 w-6", option.color)} />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-neutral-900 dark:text-neutral-50">{option.title}</h3>
                                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                                    {option.description}
                                </p>
                            </div>
                            <div className={cn(
                                "h-5 w-5 rounded-full border-2 mt-1 flex items-center justify-center transition-colors",
                                selectedType === option.id ? "border-blue-500 bg-blue-500" : "border-neutral-300"
                            )}>
                                {selectedType === option.id && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4 px-1">
                    <span className="text-sm font-medium text-neutral-500">Formato:</span>
                    <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                        <button
                            onClick={() => setExportFormat("pdf")}
                            className={cn(
                                "px-4 py-1.5 text-sm font-bold rounded-md transition-all",
                                exportFormat === "pdf" ? "bg-white dark:bg-neutral-700 shadow-sm text-blue-600" : "text-neutral-500"
                            )}
                        >
                            PDF
                        </button>
                        <button
                            onClick={() => setExportFormat("excel")}
                            className={cn(
                                "px-4 py-1.5 text-sm font-bold rounded-md transition-all",
                                exportFormat === "excel" ? "bg-white dark:bg-neutral-700 shadow-sm text-green-600" : "text-neutral-500"
                            )}
                        >
                            Excel
                        </button>
                    </div>
                </div>

                <DialogFooter className="mt-6">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleExport} 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                A Gerar...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Descarregar {exportFormat.toUpperCase()}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
