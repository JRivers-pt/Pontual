import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrollmentTerminals } from "@/lib/enrollment-sync";

export const dynamic = "force-dynamic";
const errorMessages: Record<string, string> = {
    FINGERPRINT_PAIR_REQUIRED: "A biometria requer recaptura com duas leituras do mesmo dedo.",
    PROTECTED_ACCOUNT: "O ID corresponde a uma conta protegida no BioStar. Rever o mapeamento.",
    USER_ID_COLLISION: "O ID BioStar já pertence a outro registo. Rever o mapeamento.",
    USER_MAPPING_REQUIRED: "É necessário configurar o ID BioStar deste colaborador.",
    ACCESS_GROUPS_REQUIRED: "É necessário confirmar a política de grupos de acesso no serviço central.",
    DEVICE_READBACK_FAILED: "O terminal ainda não confirmou os dados enviados. Nova tentativa automática.",
    LEGACY_USER_IMPORT_REQUIRED: "Este registo já existe no equipamento e requer reconciliação antes de alterar a biometria existente.",
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
    const now = new Date();
    await prisma.enrollmentAgent.upsert({ where: { userId: user.id },
        create: { userId: user.id, lastSeenAt: now }, update: { lastSeenAt: now } });
    const due = { userId: user.id, OR: [
        { status: { in: ["PENDING", "ERROR"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
    ] };
    const candidates = await prisma.enrollmentTask.findMany({ where: due, take: 1, orderBy: { nextAttemptAt: "asc" } });
    const jobs = [];
    for (const task of candidates) {
        const leaseToken = randomUUID();
        const claimed = await prisma.enrollmentTask.updateMany({
            where: { ...due, id: task.id, revision: task.revision },
            data: { status: "PROCESSING", leaseToken, leaseExpiresAt: new Date(now.getTime() + 180_000), attempts: { increment: 1 } },
        });
        if (!claimed.count) continue;
        const employee = await prisma.employee.findUnique({
            where: { userId_workno: { userId: user.id, workno: task.workno } },
            select: { name: true, active: true, cardNumber: true, fingerprintTemplate: true },
        });
        jobs.push({ id: task.id, revision: task.revision, leaseToken, workno: task.workno,
            terminalId: task.terminalId, active: task.active && !!employee?.active, clearFingerprint: task.clearFingerprint,
            remoteUserId: task.remoteUserId, employee });
    }
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
    const user = await school(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!enrollmentTerminals(user.id).length) return NextResponse.json({ error: "Enrollment sync not enabled" }, { status: 409 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || typeof body.revision !== "string" ||
        typeof body.leaseToken !== "string" || !["EXPORTED", "ERROR"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
    }
    const task = await prisma.enrollmentTask.findFirst({ where: { id: body.id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const remoteUserId = typeof body.remoteUserId === "string" && /^\d{1,10}$/.test(body.remoteUserId) &&
        Number(body.remoteUserId) > 1 && Number(body.remoteUserId) <= 4294967295 ? body.remoteUserId : null;
    if (task.remoteUserId && remoteUserId && task.remoteUserId !== remoteUserId) {
        return NextResponse.json({ error: "Conflicting remote identity" }, { status: 409 });
    }
    const now = new Date();
    const result = await prisma.enrollmentTask.updateMany({ where: {
        id: task.id, userId: user.id, revision: body.revision, leaseToken: body.leaseToken,
        status: "PROCESSING", leaseExpiresAt: { gt: now },
    }, data: {
        status: body.status, leaseToken: null, leaseExpiresAt: null,
        // Do not store arbitrary vendor bodies: they can contain biometrics or credentials.
        lastError: body.status === "ERROR" ? (typeof body.errorCode === "string" && Object.prototype.hasOwnProperty.call(errorMessages, body.errorCode)
            ? errorMessages[body.errorCode] : "Falha no envio pelo serviço central. Nova tentativa automática.") : null,
        exportedAt: body.status === "EXPORTED" ? now : null,
        ...(remoteUserId ? { remoteUserId } : {}),
        nextAttemptAt: new Date(now.getTime() + Math.min(900, 15 * 2 ** Math.min(task.attempts, 6)) * 1000),
    } });
    return NextResponse.json({ accepted: result.count === 1 }, { status: result.count ? 200 : 409 });
}

export async function PATCH(request: NextRequest) {
    const user = await school(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!enrollmentTerminals(user.id).length) return NextResponse.json({ error: "Enrollment sync not enabled" }, { status: 409 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || typeof body.revision !== "string" || typeof body.leaseToken !== "string") {
        return NextResponse.json({ error: "Invalid lease" }, { status: 400 });
    }
    const task = await prisma.enrollmentTask.findFirst({ where: { id: body.id, userId: user.id,
        revision: body.revision, leaseToken: body.leaseToken, status: "PROCESSING", leaseExpiresAt: { gt: new Date() } }, select: { id: true, remoteUserId: true } });
    if (task && body.remoteUserId !== undefined) {
        if (typeof body.remoteUserId !== "string" || !/^\d{1,10}$/.test(body.remoteUserId) || Number(body.remoteUserId) < 2 ||
            Number(body.remoteUserId) > 4294967295 || (task.remoteUserId && task.remoteUserId !== body.remoteUserId)) {
            return NextResponse.json({ valid: false }, { status: 409 });
        }
        const bound = await prisma.enrollmentTask.updateMany({ where: { id: task.id, userId: user.id,
            revision: body.revision, leaseToken: body.leaseToken, status: "PROCESSING", leaseExpiresAt: { gt: new Date() } },
            data: { remoteUserId: body.remoteUserId } });
        return NextResponse.json({ valid: bound.count === 1 }, { status: bound.count ? 200 : 409 });
    }
    return NextResponse.json({ valid: !!task }, { status: task ? 200 : 409 });
}
