import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { enqueueEnrollment, enrollmentTerminals, lockEnrollment } from "@/lib/enrollment-sync";
import { normalizeWorkno } from "@/lib/workno";

export const GET = auth(async req => {
    if (!req.auth?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const account = await prisma.user.findUnique({ where: { id: req.auth.user.id }, select: { parentUserId: true } });
    const userId = account?.parentUserId || req.auth.user.id;
    const terminals = enrollmentTerminals(userId);
    if (!terminals.length) return NextResponse.json({ enabled: false, online: false, tasks: [] });
    const [agent, tasks] = await Promise.all([
        prisma.enrollmentAgent.findUnique({ where: { userId } }),
        prisma.enrollmentTask.findMany({ where: { userId }, select: {
            workno: true, terminalId: true, status: true, attempts: true, lastError: true, exportedAt: true,
        } }),
    ]);
    return NextResponse.json({ enabled: true, online: !!agent && Date.now() - agent.lastSeenAt.getTime() < 120_000,
        lastSeenAt: agent?.lastSeenAt || null, terminalCount: terminals.length, terminalIds: terminals, tasks },
        { headers: { "Cache-Control": "no-store" } });
});

export const POST = auth(async req => {
    if (!req.auth?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const account = await prisma.user.findUnique({ where: { id: req.auth.user.id }, select: { parentUserId: true } });
    const userId = account?.parentUserId || req.auth.user.id;
    if (!enrollmentTerminals(userId).length) return NextResponse.json({ error: "Sincronização ainda não configurada" }, { status: 409 });
    const body = await req.json().catch(() => null);
    if (typeof body?.workno !== "string" || !body.workno.trim()) return NextResponse.json({ error: "Número obrigatório" }, { status: 400 });
    const workno = normalizeWorkno(body.workno);
    const found = await prisma.$transaction(async tx => {
        await lockEnrollment(tx, userId, workno);
        const employee = await tx.employee.findUnique({ where: { userId_workno: { userId, workno } } });
        if (!employee) return false;
        await enqueueEnrollment(tx, userId, employee);
        await tx.enrollmentTask.updateMany({ where: { userId, workno, status: { not: "PROCESSING" } },
            data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null, exportedAt: null } });
        return true;
    });
    if (!found) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
    return NextResponse.json({ queued: true });
});
