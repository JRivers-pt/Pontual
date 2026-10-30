import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrollmentTerminals } from "@/lib/enrollment-sync";

export const dynamic = "force-dynamic";

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
            terminalId: task.terminalId, active: task.active && !!employee?.active, clearFingerprint: task.clearFingerprint, employee });
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
    const now = new Date();
    const result = await prisma.enrollmentTask.updateMany({ where: {
        id: task.id, userId: user.id, revision: body.revision, leaseToken: body.leaseToken,
        status: "PROCESSING", leaseExpiresAt: { gt: now },
    }, data: {
        status: body.status, leaseToken: null, leaseExpiresAt: null,
        // Do not store arbitrary vendor bodies: they can contain biometrics or credentials.
        lastError: body.status === "ERROR" ? "Falha no envio pelo agente. Consultar diagnóstico local." : null,
        exportedAt: body.status === "EXPORTED" ? now : null,
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
        revision: body.revision, leaseToken: body.leaseToken, status: "PROCESSING", leaseExpiresAt: { gt: new Date() } }, select: { id: true } });
    return NextResponse.json({ valid: !!task }, { status: task ? 200 : 409 });
}
