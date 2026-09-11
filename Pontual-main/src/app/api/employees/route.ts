import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

async function getEffectiveUserId(sessionUserId: string) {
    const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, parentUserId: true }
    });
    return user?.parentUserId || sessionUserId;
}

/**
 * GET /api/employees
 * Returns the employee list for the logged-in client.
 */
export const GET = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getEffectiveUserId(req.auth.user.id);

    try {
        const employees = await prisma.employee.findMany({
            where: { userId },
            select: {
                id: true,
                workno: true,
                name: true,
                cardNumber: true,
                active: true,
                scheduleCode: true,
                scheduleName: true,
                numFingerprints: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { name: 'asc' }
        });

        if (employees.length > 0) {
            return NextResponse.json({ employees });
        }

        // Fallback: derive from AttendanceLogs (for clients not yet migrated)
        const logs = await prisma.attendanceLog.findMany({
            where: { userId },
            select: { workno: true, employeeName: true },
            distinct: ['workno'],
            orderBy: { workno: 'asc' }
        });

        const fallback = logs.map(l => ({
            id: l.workno,
            workno: l.workno,
            name: l.employeeName || l.workno,
            cardNumber: null,
            active: true,
            scheduleCode: null,
            scheduleName: null,
            numFingerprints: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        })).sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ employees: fallback });

    } catch (error: any) {
        console.error("Error fetching employees:", error);
        return NextResponse.json({
            error: "Failed to fetch employees",
            details: error.message
        }, { status: 500 });
    }
});

/**
 * POST /api/employees
 * Creates a new employee with optional schedule and biometric template.
 */
export const POST = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getEffectiveUserId(req.auth.user.id);

    try {
        const body = await req.json();
        const {
            workno,
            name,
            cardNumber,
            scheduleCode,
            scheduleName,
            scheduleId,
            fingerprintTemplate
        } = body;

        if (!workno || !name) {
            return NextResponse.json(
                { error: "Número mecanográfico (ID) e Nome são obrigatórios" },
                { status: 400 }
            );
        }

        const formattedWorkno = String(workno).trim().padStart(4, '0');
        const trimmedName = String(name).trim();

        // Check if workno already exists for this client
        const existing = await prisma.employee.findUnique({
            where: { userId_workno: { userId, workno: formattedWorkno } }
        });

        if (existing) {
            return NextResponse.json(
                { error: `Já existe um colaborador com o número ${formattedWorkno}` },
                { status: 409 }
            );
        }

        // Create Employee
        const employee = await prisma.employee.create({
            data: {
                userId,
                workno: formattedWorkno,
                name: trimmedName,
                cardNumber: cardNumber ? String(cardNumber).trim() : null,
                active: true,
                scheduleCode: scheduleCode ? String(scheduleCode).trim() : null,
                scheduleName: scheduleName ? String(scheduleName).trim() : null,
                fingerprintTemplate: fingerprintTemplate || null,
                numFingerprints: fingerprintTemplate ? 1 : 0
            }
        });

        // Link EmployeeSchedule if scheduleId or scheduleCode was provided
        let targetScheduleId = scheduleId;
        if (!targetScheduleId && scheduleCode) {
            const sched = await prisma.schedule.findFirst({
                where: {
                    userId,
                    name: { startsWith: `${scheduleCode} -` }
                }
            });
            if (sched) targetScheduleId = sched.id;
        }

        if (targetScheduleId) {
            await prisma.employeeSchedule.upsert({
                where: {
                    workno_scheduleId: {
                        workno: formattedWorkno,
                        scheduleId: targetScheduleId
                    }
                },
                update: {},
                create: {
                    workno: formattedWorkno,
                    scheduleId: targetScheduleId
                }
            });
        }

        // Audit Log
        await prisma.auditLog.create({
            data: {
                actorId: req.auth.user.id,
                actorName: req.auth.user.name || 'Utilizador',
                clientId: userId,
                action: 'MANUAL_INSERT',
                targetWorkno: formattedWorkno,
                targetName: trimmedName,
                description: `Colaborador ${trimmedName} (#${formattedWorkno}) adicionado via plataforma com horário ${scheduleCode || 'Geral'}. Biometria: ${fingerprintTemplate ? 'Registada' : 'Pendente'}.`
            }
        }).catch(() => {});

        return NextResponse.json({ success: true, employee });

    } catch (error: any) {
        console.error("Error creating employee:", error);
        return NextResponse.json(
            { error: "Erro ao criar colaborador", details: error.message },
            { status: 500 }
        );
    }
});

/**
 * PUT /api/employees
 * Updates an existing employee (name, schedule, active status, card, fingerprint).
 */
export const PUT = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getEffectiveUserId(req.auth.user.id);

    try {
        const body = await req.json();
        const {
            id,
            workno,
            name,
            cardNumber,
            active,
            scheduleCode,
            scheduleName,
            scheduleId,
            fingerprintTemplate
        } = body;

        if (!workno) {
            return NextResponse.json({ error: "Número mecanográfico obrigatório" }, { status: 400 });
        }

        const formattedWorkno = String(workno).trim().padStart(4, '0');

        const updateData: any = {};
        if (name !== undefined) updateData.name = String(name).trim();
        if (cardNumber !== undefined) updateData.cardNumber = cardNumber ? String(cardNumber).trim() : null;
        if (active !== undefined) updateData.active = Boolean(active);
        if (scheduleCode !== undefined) updateData.scheduleCode = scheduleCode ? String(scheduleCode).trim() : null;
        if (scheduleName !== undefined) updateData.scheduleName = scheduleName ? String(scheduleName).trim() : null;
        if (fingerprintTemplate !== undefined) {
            updateData.fingerprintTemplate = fingerprintTemplate || null;
            updateData.numFingerprints = fingerprintTemplate ? 1 : 0;
        }

        const updated = await prisma.employee.update({
            where: { userId_workno: { userId, workno: formattedWorkno } },
            data: updateData
        });

        // Update schedule linkage if scheduleId / scheduleCode changed
        if (scheduleId || scheduleCode) {
            let targetScheduleId = scheduleId;
            if (!targetScheduleId && scheduleCode) {
                const sched = await prisma.schedule.findFirst({
                    where: { userId, name: { startsWith: `${scheduleCode} -` } }
                });
                if (sched) targetScheduleId = sched.id;
            }

            if (targetScheduleId) {
                // Remove old schedules for this employee
                await prisma.employeeSchedule.deleteMany({
                    where: { workno: formattedWorkno }
                });
                // Assign new
                await prisma.employeeSchedule.create({
                    data: { workno: formattedWorkno, scheduleId: targetScheduleId }
                });
            }
        }

        return NextResponse.json({ success: true, employee: updated });

    } catch (error: any) {
        console.error("Error updating employee:", error);
        return NextResponse.json(
            { error: "Erro ao atualizar colaborador", details: error.message },
            { status: 500 }
        );
    }
});

/**
 * DELETE /api/employees
 * Deletes or deactivates an employee.
 */
export const DELETE = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getEffectiveUserId(req.auth.user.id);
    const url = new URL(req.url);
    const workno = url.searchParams.get("workno");

    if (!workno) {
        return NextResponse.json({ error: "Número mecanográfico obrigatório" }, { status: 400 });
    }

    try {
        const formattedWorkno = String(workno).trim().padStart(4, '0');

        await prisma.employeeSchedule.deleteMany({
            where: { workno: formattedWorkno }
        });

        await prisma.employee.delete({
            where: { userId_workno: { userId, workno: formattedWorkno } }
        });

        return NextResponse.json({ success: true, message: "Colaborador removido com sucesso" });
    } catch (error: any) {
        console.error("Error deleting employee:", error);
        return NextResponse.json(
            { error: "Erro ao remover colaborador", details: error.message },
            { status: 500 }
        );
    }
});
