import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user || !user.apiKey || !user.apiSecret) {
            return NextResponse.json({ devices: [] });
        }

        // 1. Get Auth Token
        const tokenRequestBody = {
            header: {
                nameSpace: 'authorize.token',
                nameAction: 'token',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            payload: {
                api_key: user.apiKey,
                api_secret: user.apiSecret
            }
        };

        const tokenResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokenRequestBody),
        });

        if (!tokenResponse.ok) {
            throw new Error(`Token authentication failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.payload?.token;

        if (!token) {
            return NextResponse.json({ devices: [] });
        }

        // 2. Fetch last 15 days of records to discover devices and their last activity
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 15);

        const recordsRequestBody = {
            header: {
                nameSpace: 'attendance.record',
                nameAction: 'getrecord',
                version: '1.0',
                requestId: generateRequestId(),
                timestamp: generateTimestamp()
            },
            authorize: {
                type: 'token',
                token: token
            },
            payload: {
                begin_time: startDate.toISOString().replace('Z', '+00:00'),
                end_time: endDate.toISOString().replace('Z', '+00:00'),
                order: 'desc', // get latest first
                page: 1,
                per_page: 200
            }
        };

        const recordsResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordsRequestBody),
        });

        if (!recordsResponse.ok) {
            throw new Error(`Records fetch failed: ${recordsResponse.status}`);
        }

        const recordsData = await recordsResponse.json();
        const apiRecords = recordsData.payload?.list || [];

        // 3. Group by device and identify last activity
        const devicesMap = new Map<string, { serialNumber: string; name: string; lastSeen: string }>();

        apiRecords.forEach((r: any) => {
            if (!r.device || r.device.serial_number === 'MANUAL') return;
            
            const serial = r.device.serial_number;
            const name = r.device.name || 'Equipamento';
            const checktime = r.checktime.replace(/([+-]\d{2}:\d{2}|Z)$/, '');

            const existing = devicesMap.get(serial);
            if (!existing || new Date(checktime).getTime() > new Date(existing.lastSeen).getTime()) {
                devicesMap.set(serial, {
                    serialNumber: serial,
                    name,
                    lastSeen: checktime
                });
            }
        });

        const nowMs = Date.now();
        const devicesList = Array.from(devicesMap.values()).map(dev => {
            const lastSeenMs = new Date(dev.lastSeen).getTime();
            const diffHours = (nowMs - lastSeenMs) / (1000 * 60 * 60);

            let status: 'online' | 'warning' | 'offline' = 'online';
            if (diffHours > 72) {
                status = 'offline';
            } else if (diffHours > 36) {
                status = 'warning';
            }

            return {
                ...dev,
                status,
                diffHours: Math.round(diffHours)
            };
        });

        return NextResponse.json({ devices: devicesList });
    } catch (error: any) {
        console.error('Error in devices status API:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch device status' },
            { status: 500 }
        );
    }
}
