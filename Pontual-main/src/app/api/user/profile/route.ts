import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const GET = auth(async (req) => {
    if (!req.auth || !req.auth.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.auth.user.id },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                company: true,
                reportHeader: true,
                logoUrl: true,
            }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Remove sensitive info
        const { password, ...safeUser } = user;

        return NextResponse.json(safeUser);
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
});
