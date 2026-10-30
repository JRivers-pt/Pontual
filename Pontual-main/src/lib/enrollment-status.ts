export type EnrollmentStatus = {
    enabled: boolean; online: boolean; terminalCount?: number; terminalIds?: string[];
    tasks: { workno: string; terminalId: string; status: string; lastError?: string | null }[];
};

export function enrollmentStatusText(status: EnrollmentStatus | null, workno: string) {
    if (!status) return "Estado dos terminais indisponível";
    if (!status.enabled) return "Terminais: sem confirmação";
    const required = new Set(status.terminalIds || []);
    const tasks = [...new Map(status.tasks.filter(task => task.workno === workno && (!required.size || required.has(task.terminalId)))
        .map(task => [task.terminalId, task] as const)).values()];
    if (!tasks.length) return "Terminais: sem envio confirmado";
    const expected = required.size || status.terminalCount || 0;
    const exported = tasks.filter(task => task.status === "EXPORTED").length;
    const failed = tasks.find(task => task.status === "ERROR");
    if (failed) return `Envio com falha (${exported}/${expected}). ${failed.lastError || "Nova tentativa automática."}`;
    if (expected > 0 && exported === expected) return `BioStar aceitou ${exported}/${expected} envios; validar passagem`;
    if (!status.online) return "A aguardar serviço central (sem contacto recente)";
    return `Envio pendente (${exported}/${expected})`;
}
