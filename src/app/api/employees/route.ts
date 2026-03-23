import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const GET = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch all worknos from schedules belonging to this user
        const employeeSchedules = await prisma.employeeSchedule.findMany({
            where: {
                schedule: {
                    userId: req.auth.user.id
                }
            },
            select: {
                workno: true
            }
        });

        // Unique worknos
        const worknos = Array.from(new Set(employeeSchedules.map(es => es.workno)));

        return NextResponse.json({ worknos });
    } catch (error: any) {
        console.error("Error fetching managed employees:", error);
        return NextResponse.json({ 
            error: "Failed to fetch managed employees",
            details: error.message 
        }, { status: 500 });
    }
});
