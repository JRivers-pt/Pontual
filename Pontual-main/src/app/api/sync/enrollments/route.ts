import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bindRemoteIdentity, enrollmentTerminals, lockEnrollment } from "@/lib/enrollment-sync";

export const dynamic = "force-dynamic";
const errorMessages: Record<string, string> = {
    FINGERPRINT_PAIR_REQUIRED: "A biometria requer recaptura com duas leituras do mesmo dedo.",
    PROTECTED_ACCOUNT: "O ID corresponde a uma conta protegida no BioStar. Rever o mapeamento.",
    USER_ID_COLLISION: "O ID BioStar já pertence a outro registo. Rever o mapeamento.",
    USER_MAPPING_REQUIRED: "É necessário configurar o ID BioStar deste colaborador.",
    ACCESS_GROUPS_REQUIRED: "É necessário confirmar a política de grupos de acesso no serviço central.",
    DEVICE_READBACK_FAILED: "O terminal ainda não confirmou os dados enviados. Nova tentativa automática.",
    LEGACY_USER_IMPORT_REQUIRED: "Este registo já existe no equipamento e requer reconciliação antes de alterar a biometria existente.",
    TEMPLATE_FORMAT_MISMATCH: "O formato biométrico do BioStar foi alterado. Confirmar a configuração antes de reenviar.",
};

async function school(request: NextRequest) {
    const token = request.headers.get("x-school-token");
    if (!token) return null;
    return prisma.user.findUnique({ where: { syncToken: token }, select: { id: true } });
}

// Leased jobs are delivered at least once. Revision + random lease fence stale workers.
export async function GET(request: NextRequest) {
    const user = await school(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!enrollmentTerminals(user.id).length) return NextResponse.json({ error: "Enrollment sync not enabled" }, { status: 409 });
    if (request.nextUrl?.searchParams.get("health") === "true") {
        const [agent, pendingCount] = await Promise.all([
            prisma.enrollmentAgent.findUnique({ where: { userId: user.id } }),
            prisma.enrollmentTask.count({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING", "ERROR"] } } }),
        ]);
        // Diagnostic probes must neither consume work nor impersonate the worker's heartbeat.
        return NextResponse.json({ enabled: true, online: !!agent && Date.now() - agent.lastSeenAt.getTime() < 120_000,
            lastSeenAt: agent?.lastSeenAt || null, pendingCount }, { headers: { "Cache-Control": "no-store" } });
    }
    const now = new Date();
    await prisma.enrollmentAgent.upsert({ where: { userId: user.id },
        create: { userId: user.id, lastSeenAt: now }, update: { lastSeenAt: now } });
    const due = { userId: user.id, OR: [
        { status: { in: ["PENDING", "ERROR"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
    ] };
    const candidates = await prisma.enrollmentTask.findMany({ where: due, take: 20, orderBy: { nextAttemptAt: "asc" } });
    const jobs = [];
    for (const task of candidates) {
        const leaseToken = randomUUID();
        const job = await prisma.$transaction(async tx => {
        await lockEnrollment(tx, user.id, task.workno);
        const busy = await tx.enrollmentTask.findFirst({ where: { userId: user.id, workno: task.workno,
            status: "PROCESSING", leaseExpiresAt: { gt: new Date() } }, select: { id: true } });
        if (busy) return null;
        const claimed = await tx.enrollmentTask.updateMany({
            where: { ...due, id: task.id, revision: task.revision },
            data: { status: "PROCESSING", leaseToken, leaseExpiresAt: new Date(now.getTime() + 180_000), attempts: { increment: 1 } },
        });
        if (!claimed.count) return null;
        const employee = await tx.employee.findUnique({
            where: { userId_workno: { userId: user.id, workno: task.workno } },
            select: { name: true, active: true, cardNumber: true, fingerprintTemplate: true },
        });
        const current = await tx.enrollmentTask.findUnique({ where: { id: task.id }, select: { remoteUserId: true } });
        return { id: task.id, revision: task.revision, leaseToken, workno: task.workno,
            managementTag: `PTL-${createHash("sha256").update(`${user.id}:${task.workno}`).digest("hex").slice(0, 24)}`,
            terminalId: task.terminalId, active: task.active && !!employee?.active, clearFingerprint: task.clearFingerprint,
            remoteUserId: current?.remoteUserId || null, employee };
        });
        if (job) { jobs.push(job); break; }
    }
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
    return completeLease(request, true);
}

export async function PATCH(request: NextRequest) {
    return completeLease(request, false);
}

async function completeLease(request: NextRequest, receipt: boolean) {
    const user = await school(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!enrollmentTerminals(user.id).length) return NextResponse.json({ error: "Enrollment sync not enabled" }, { status: 409 });
    const body = await request.json().catch(() => null);
    if (!body || ![body.id, body.revision, body.leaseToken].every(value => typeof value === "string" && value.length > 0 && value.length <= 128) ||
        (receipt && !["EXPORTED", "ERROR"].includes(body.status))) {
        return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
    }
    let remoteUserId: string | undefined;
    if (body.remoteUserId !== undefined) {
        if (typeof body.remoteUserId !== "string" || !/^\d{1,10}$/.test(body.remoteUserId) ||
            Number(body.remoteUserId) < 2 || Number(body.remoteUserId) > 4294967295 || String(Number(body.remoteUserId)) !== body.remoteUserId) {
            return NextResponse.json({ error: "Invalid remote identity" }, { status: 400 });
        }
        remoteUserId = body.remoteUserId;
    }
    try {
    const result = await prisma.$transaction(async tx => {
    const task = await tx.enrollmentTask.findFirst({ where: { id: body.id, userId: user.id } });
    if (!task) return { status: 404, body: { error: "Task not found" } };
    await lockEnrollment(tx, user.id, task.workno);
    const now = new Date();
    const where = {
        id: task.id, userId: user.id, revision: body.revision, leaseToken: body.leaseToken,
        status: "PROCESSING", leaseExpiresAt: { gt: new Date(now.getTime() + (receipt ? 0 : 45_000)) },
    };
    if (!receipt) {
        const valid = await tx.enrollmentTask.findFirst({ where, select: { id: true } });
        if (!valid) return { status: 409, body: { valid: false } };
        if (remoteUserId) await bindRemoteIdentity(tx, user.id, task.workno, remoteUserId);
        return { status: 200, body: { valid: true } };
    }
    const updated = await tx.enrollmentTask.updateMany({ where, data: {
        status: body.status, leaseToken: null, leaseExpiresAt: null,
        // Do not store arbitrary vendor bodies: they can contain biometrics or credentials.
        lastError: body.status === "ERROR" ? (typeof body.errorCode === "string" && Object.prototype.hasOwnProperty.call(errorMessages, body.errorCode)
            ? errorMessages[body.errorCode] : "Falha no envio pelo serviço central. Nova tentativa automática.") : null,
        exportedAt: body.status === "EXPORTED" ? now : null,
        nextAttemptAt: new Date(now.getTime() + Math.min(900, 15 * 2 ** Math.min(task.attempts, 6)) * 1000),
    } });
    if (!updated.count) return { status: 409, body: { accepted: false } };
    if (remoteUserId) await bindRemoteIdentity(tx, user.id, task.workno, remoteUserId);
    return { status: 200, body: { accepted: true } };
    });
    return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof Error && error.message === "REMOTE_IDENTITY_CONFLICT") {
            return NextResponse.json({ error: "Conflicting remote identity" }, { status: 409 });
        }
        throw error;
    }
}
