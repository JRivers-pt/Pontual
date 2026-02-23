import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";

export const GET = auth(async (req) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const clients = await prisma.user.findMany({
            where: {
                role: "CLIENT",
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return NextResponse.json(clients);
    } catch (error) {
        console.error("Error fetching clients:", error);
        return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
    }
});

export const POST = auth(async (req) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { username, password, email, name, company, apiKey, apiSecret, apiUrl } = body;

        if (!username || !password) {
            return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({
            where: { username },
        });

        if (existingUser) {
            return NextResponse.json({ error: "Username already exists" }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 8);

        const client = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                email: email || null,
                name: name || null,
                company: company || null,
                apiKey: apiKey || null,
                apiSecret: apiSecret || null,
                apiUrl: apiUrl || "https://api.eu.crosschexcloud.com/",
                role: "CLIENT",
            },
        });

        return NextResponse.json(client);
    } catch (error) {
        console.error("Error creating client:", error);
        return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
    }
});
