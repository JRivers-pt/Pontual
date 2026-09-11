import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const GET = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.auth.user.id } });
        const effectiveUserId = user?.parentUserId || req.auth.user.id;

        let schedules = await prisma.schedule.findMany({
            where: { userId: effectiveUserId },
            include: {
                employeeSchedules: true
            }
        });

        // AUTO-SEED FOR VILA PEIXOTO
        const companyName = user?.company;

        if (schedules.length === 0 && companyName && companyName.toLowerCase().includes("vila peixoto")) {
            console.log("Auto-seeding schedules for Vila Peixoto...");

            // 1. Create Schedules
            const s12_22 = await prisma.schedule.create({
                data: { name: "Turno 12h-22h", startTime: "12:00", endTime: "22:00", lateTolerance: 15, userId: effectiveUserId }
            });
            const s9_18 = await prisma.schedule.create({
                data: { name: "Turno 9h-18h", startTime: "09:00", endTime: "18:00", lateTolerance: 15, userId: effectiveUserId }
            });
            const s7_16 = await prisma.schedule.create({
                data: { name: "Turno Júlio 7h-16h", startTime: "07:00", endTime: "16:00", lateTolerance: 15, userId: effectiveUserId }
            });

            schedules = await prisma.schedule.findMany({
                where: { userId: effectiveUserId },
                include: { employeeSchedules: true }
            });
        }

        return NextResponse.json(schedules);
    } catch (error: any) {
        console.error("Error fetching schedules:", error);
        return NextResponse.json({
            error: "Failed to fetch schedules: " + (error.message || String(error)),
            details: error.stack
        }, { status: 500 });
    }
});

export const POST = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { name, startTime, endTime, lateTolerance } = body;

        const schedule = await prisma.schedule.create({
            data: {
                name,
                startTime,
                endTime,
                lateTolerance,
                userId: req.auth.user.id
            }
        });

        return NextResponse.json(schedule);
    } catch (error) {
        console.error("Error creating schedule:", error);
        return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
    }
});
