import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/employees
 * Returns the permanent employee roster for the logged-in client.
 * Fast: reads from the Employee table, no date range needed.
 * Falls back to distinct worknos from AttendanceLogs if Employee table is empty.
 */
export const GET = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = req.auth.user.id;

    try {
        // Primary: read from permanent Employee table
        const employees = await prisma.employee.findMany({
            where: { userId, active: true },
            select: { workno: true, name: true, scheduleCode: true, scheduleName: true },
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
            workno: l.workno,
            name: l.employeeName || l.workno,
            scheduleCode: null,
            scheduleName: null
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
