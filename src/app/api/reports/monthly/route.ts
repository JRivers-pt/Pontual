import { NextRequest, NextResponse } from "next/server";
import { runMonthlyReports } from "@/lib/reports/monthly-report-service";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const forceRun = searchParams.get("force") === "true";
    const cycleParam = searchParams.get("cycle") as any; // "CALENDAR_MONTH" | "CUTOFF_26_25" | "ALL"
    const clientParam = searchParams.get("client") || undefined;
    const authHeader = request.headers.get("authorization");

    // Security check for cron: Allow if CRON_SECRET matches or if force=true
    if (!forceRun && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        let cycle: "CALENDAR_MONTH" | "CUTOFF_26_25" | "ALL" = "ALL";
        if (cycleParam === "first_of_month" || cycleParam === "CALENDAR_MONTH") {
            cycle = "CALENDAR_MONTH";
        } else if (cycleParam === "cutoff_26" || cycleParam === "CUTOFF_26_25") {
            cycle = "CUTOFF_26_25";
        }

        const result = await runMonthlyReports({
            cycle,
            targetUsername: clientParam,
            sendEmail: true
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Critical error running automated monthly reports:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        // Authenticated admin or cron trigger
        const session = await auth();
        const isAdmin = session?.user && (session.user as any).role === "ADMIN";
        const authHeader = request.headers.get("authorization");
        const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

        if (!isAdmin && !isCron) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const {
            cycle = "ALL",
            client,
            startDate,
            endDate,
            overrideEmail,
            sendEmail = true
        } = body;

        const result = await runMonthlyReports({
            cycle,
            targetUsername: client,
            customStartDate: startDate ? new Date(startDate) : undefined,
            customEndDate: endDate ? new Date(endDate) : undefined,
            overrideEmail,
            sendEmail
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Critical error triggering monthly reports:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}