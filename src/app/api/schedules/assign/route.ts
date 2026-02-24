import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const POST = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { workno, scheduleId } = body;

        if (!workno || !scheduleId) {
            return NextResponse.json({ error: "Workno and ScheduleId are required" }, { status: 400 });
        }

        const assignment = await prisma.employeeSchedule.upsert({
            where: {
                workno_scheduleId: {
                    workno,
                    scheduleId
                }
            },
            update: {
                scheduleId
            },
            create: {
                workno,
                scheduleId
            }
        });

        return NextResponse.json(assignment);
    } catch (error) {
        console.error("Error assigning schedule:", error);
        return NextResponse.json({ error: "Failed to assign schedule" }, { status: 500 });
    }
});
