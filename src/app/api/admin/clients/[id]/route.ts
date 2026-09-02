import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";

export const GET = auth(async (req, { params }) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params as { id: string };

    try {
        const client = await prisma.user.findUnique({
            where: { id },
        });

        if (!client) {
            return NextResponse.json({ error: "Client not found" }, { status: 404 });
        }

        return NextResponse.json(client);
    } catch (error) {
        console.error("Error fetching client:", error);
        return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 });
    }
});

export const PATCH = auth(async (req, { params }) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params as { id: string };

    try {
        const body = await req.json();
        const {
            username, password, email, name, company, apiKey, apiSecret, apiUrl, reportHeader, logoUrl, vpEmail, autoEmailReports,
            overtimeTolerance, subtractTolerance, mealBreakMinutes,
            mealBreakThresholdHours, exemptIds, overtimeCapHours
        } = body;

        const updateData: any = {
            username,
            email: email || null,
            name: name || null,
            company: company || null,
            apiKey: apiKey || null,
            apiSecret: apiSecret || null,
            apiUrl: apiUrl || undefined,
            reportHeader: reportHeader !== undefined ? reportHeader : undefined,
            logoUrl: logoUrl !== undefined ? logoUrl : undefined,
            vpEmail: vpEmail !== undefined ? vpEmail : undefined,
            autoEmailReports: autoEmailReports !== undefined ? autoEmailReports : undefined,
            overtimeTolerance: overtimeTolerance !== undefined ? overtimeTolerance : undefined,
            subtractTolerance: subtractTolerance !== undefined ? subtractTolerance : undefined,
            mealBreakMinutes: mealBreakMinutes !== undefined ? mealBreakMinutes : undefined,
            mealBreakThresholdHours: mealBreakThresholdHours !== undefined ? mealBreakThresholdHours : undefined,
            exemptIds: exemptIds !== undefined ? exemptIds : undefined,
            overtimeCapHours: overtimeCapHours !== undefined ? overtimeCapHours : undefined,
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 8);
        }

        const client = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(client);
    } catch (error) {
        console.error("Error updating client:", error);
        return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
    }
});

export const DELETE = auth(async (req, { params }) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params as { id: string };

    try {
        await prisma.user.delete({
            where: { id },
        });

        return NextResponse.json({ message: "Client deleted successfully" });
    } catch (error) {
        console.error("Error deleting client:", error);
        return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
    }
});
