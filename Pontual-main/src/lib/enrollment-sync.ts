import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

// Explicit opt-in for one school. No new tables are queried until configured.
export function enrollmentTerminals(userId: string): string[] {
    if (process.env.ENROLLMENT_SYNC_USER_ID !== userId) return [];
    return [...new Set((process.env.ENROLLMENT_TERMINAL_IDS || "").split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s)))];
}

type DesiredEmployee = {
    workno: string; name: string; active: boolean; cardNumber: string | null;
    fingerprintTemplate: string | null;
};

export async function enqueueEnrollment(tx: Prisma.TransactionClient, userId: string, employee: DesiredEmployee, clearRequested = false) {
    const terminals = enrollmentTerminals(userId);
    if (!terminals.length) return;
    // Full content hash catches changes anywhere in a template, unlike prefix/length signatures.
    for (const terminalId of terminals) {
        const key = { userId, workno: employee.workno, terminalId };
        const current = await tx.enrollmentTask.findUnique({ where: { userId_workno_terminalId: key } });
        // Missing cloud biometrics can be a legacy/imported record, not an instruction to erase a reader.
        const clearFingerprint = !employee.fingerprintTemplate && (clearRequested || !!current?.clearFingerprint);
        const revision = createHash("sha256").update(JSON.stringify({
            workno: employee.workno, name: employee.name, active: employee.active,
            cardNumber: employee.cardNumber, fingerprintTemplate: employee.fingerprintTemplate, clearFingerprint,
        })).digest("hex");
        if (current?.revision === revision) continue;
        const desired = { revision, active: employee.active, clearFingerprint, status: "PENDING", attempts: 0,
            leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(), lastError: null, exportedAt: null };
        await tx.enrollmentTask.upsert({ where: { userId_workno_terminalId: key },
            create: { ...key, ...desired }, update: current?.status === "PROCESSING" && current.leaseExpiresAt && current.leaseExpiresAt > new Date()
                ? { ...desired, status: "PROCESSING", leaseToken: current.leaseToken, leaseExpiresAt: current.leaseExpiresAt }
                : desired });
    }
}

export async function enqueueRemoval(tx: Prisma.TransactionClient, userId: string, workno: string) {
    for (const terminalId of enrollmentTerminals(userId)) {
        const key = { userId, workno, terminalId };
        const current = await tx.enrollmentTask.findUnique({ where: { userId_workno_terminalId: key } });
        const desired = { revision: randomUUID(), active: false, status: "PENDING", attempts: 0,
            leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(), lastError: null, exportedAt: null };
        await tx.enrollmentTask.upsert({ where: { userId_workno_terminalId: key },
            create: { ...key, ...desired }, update: current?.status === "PROCESSING" && current.leaseExpiresAt && current.leaseExpiresAt > new Date()
                ? { ...desired, status: "PROCESSING", leaseToken: current.leaseToken, leaseExpiresAt: current.leaseExpiresAt }
                : desired });
    }
}
