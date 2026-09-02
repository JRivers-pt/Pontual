import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCrossChexToken, generateRequestId, generateTimestamp, crossChexErrorToPortuguese } from "@/lib/api-server";

export const dynamic = 'force-dynamic';

export const GET = auth(async (req, { params }) => {
    if (!req.auth || (req.auth.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params as { id: string };

    try {
        const client = await prisma.user.findUnique({
            where: { id },
            include: { _count: { select: { schedules: true } } },
        });

        if (!client) {
            return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
        }

        if (!client.apiKey || !client.apiSecret) {
            return NextResponse.json({
                client: { id: client.id, username: client.username, company: client.company },
                credentialsConfigured: false,
                devices: [],
                error: "Credenciais CrossChex não configuradas para este cliente.",
            });
        }

        const token = await getCrossChexToken(client.apiKey, client.apiSecret, client.apiUrl || undefined);

        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3); // últimos 3 meses para detetar dispositivos

        const requestBody = {
            header: {
                nameSpace: "attendance.record",
                nameAction: "getrecord",
                version: "1.0",
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            authorize: {
                type: "token",
                token: token
            },
            payload: {
                begin_time: startDate.toISOString().replace('Z', '+00:00'),
                end_time: endDate.toISOString().replace('Z', '+00:00'),
                order: "asc",
                page: 1,
                per_page: 1000
            }
        };

        const recordsResponse = await fetch(client.apiUrl || "https://api.eu.crosschexcloud.com/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await recordsResponse.json().catch(() => null);

        if (!recordsResponse.ok || !data) {
            throw new Error(crossChexErrorToPortuguese(recordsResponse.status, data));
        }

        const records = data.payload?.list || [];

        const devicesMap = new Map<string, { serialNumber: string; name: string; lastSeen: string }>();
        records.forEach((r: any) => {
            const serial = r.device?.serial_number;
            if (!serial) return;
            const name = r.device?.name || "Equipamento";
            const time = r.checktime || null;
            const existing = devicesMap.get(serial);
            if (!existing || (time && time > existing.lastSeen)) {
                devicesMap.set(serial, { serialNumber: serial, name, lastSeen: time || existing?.lastSeen || "" });
            }
        });

        const devices = Array.from(devicesMap.values())
            .filter(d => d.serialNumber !== "MANUAL")
            .sort((a, b) => a.name.localeCompare(b.name));

        const totalEmployees = new Set(records.map((r: any) => r.employee?.workno).filter(Boolean)).size;

        return NextResponse.json({
            client: { id: client.id, username: client.username, company: client.company },
            credentialsConfigured: true,
            devices,
            deviceCount: devices.length,
            totalEmployees,
            scheduleCount: client._count.schedules,
        });
    } catch (error: any) {
        console.error("Error fetching devices:", error);
        return NextResponse.json(
            {
                error: error?.message
                    ? String(error.message)
                    : "Erro ao obter os equipamentos da CrossChex Cloud.",
                credentialsConfigured: true,
                devices: [],
            },
            { status: 500 }
        );
    }
});