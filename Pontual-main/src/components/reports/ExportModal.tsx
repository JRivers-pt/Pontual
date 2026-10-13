"use client"

import * as React from "react"
import { FileText, Download, Loader2, Users, CheckCircle2 } from "lucide-react"
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

interface ExportModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onExport: (type: "summary", format: "pdf" | "excel") => Promise<void>
    loading?: boolean
    title?: string
}

export function ExportModal({ isOpen, onOpenChange, onExport, loading, title }: ExportModalProps) {
    const [exportFormat, setExportFormat] = React.useState<"pdf" | "excel">("pdf")

    const handleExport = async () => {
        await onExport("summary", exportFormat)
        onOpenChange(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px] p-5 shadow-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                <DialogHeader className="pb-1">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                        <FileText className="h-5 w-5 text-blue-600" />
                        Exportar Relatório Geral
                    </DialogTitle>
                    <DialogDescription className="text-xs text-neutral-500">
                        Relatório oficial de assiduidade com as 4 picagens diárias e total de horas.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {/* Resumo do Relatório */}
                    <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-neutral-800 dark:text-neutral-200">
                            <span className="font-semibold flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-blue-600" />
                                {title || "Todos os Colaboradores"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300 font-medium pt-1.5 border-t border-blue-200/50 dark:border-blue-900/50">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            <span>Registo diário com 4 picagens: Entrada, Almoço e Saída</span>
                        </div>
                    </div>

                    {/* Seleção do Formato */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                            Formato de Ficheiro
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setExportFormat("pdf")}
                                className={cn(
                                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-bold transition-all",
                                    exportFormat === "pdf"
                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-xs ring-1 ring-blue-500/20"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50"
                                )}
                            >
                                <span className="h-2 w-2 rounded-full bg-red-500" />
                                Documento PDF
                            </button>
                            <button
                                type="button"
                                onClick={() => setExportFormat("excel")}
                                className={cn(
                                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-bold transition-all",
                                    exportFormat === "excel"
                                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/20"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50"
                                )}
                            >
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                Folha Excel
                            </button>
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-2 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button 
                        size="sm"
                        onClick={handleExport} 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
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
