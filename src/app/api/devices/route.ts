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

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 1. Query devices from local database cache
        let dbDevices = await prisma.device.findMany({
            where: { userId: user.id }
        });

        // 2. Self-warm cache if empty (first load ever)
        if (dbDevices.length === 0 && user.apiKey && user.apiSecret) {
            try {
                console.log(`Devices API: Warming cache for user ${user.username}`);
                
                // Get Auth Token
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

                if (tokenResponse.ok) {
                    const tokenData = await tokenResponse.json();
                    const token = tokenData.payload?.token;

                    if (token) {
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
                                token
                            },
                            payload: {
                                begin_time: startDate.toISOString().replace('Z', '+00:00'),
                                end_time: endDate.toISOString().replace('Z', '+00:00'),
                                order: 'desc',
                                page: 1,
                                per_page: 200
                            }
                        };

                        const recordsResponse = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(recordsRequestBody),
                        });

                        if (recordsResponse.ok) {
                            const recordsData = await recordsResponse.json();
                            const apiRecords = recordsData.payload?.list || [];

                            const devicesToUpsert = new Map<string, { serialNumber: string; name: string; lastSeen: Date }>();
                            
                            apiRecords.forEach((r: any) => {
                                if (!r.device || r.device.serial_number === 'MANUAL') return;
                                const serial = r.device.serial_number;
                                const name = r.device.name || 'Equipamento';
                                const checktime = new Date(r.checktime);
                                
                                const existing = devicesToUpsert.get(serial);
                                if (!existing || checktime > existing.lastSeen) {
                                    devicesToUpsert.set(serial, {
                                        serialNumber: serial,
                                        name,
                                        lastSeen: checktime
                                    });
                                }
                            });

                            for (const dev of devicesToUpsert.values()) {
                                await prisma.device.upsert({
                                    where: {
                                        serialNumber_userId: {
                                            serialNumber: dev.serialNumber,
                                            userId: user.id
                                        }
                                    },
                                    update: {
                                        name: dev.name,
                                        lastSeen: dev.lastSeen
                                    },
                                    create: {
                                        serialNumber: dev.serialNumber,
                                        name: dev.name,
                                        lastSeen: dev.lastSeen,
                                        userId: user.id
                                    }
                                });
                            }

                            // Re-query from database
                            dbDevices = await prisma.device.findMany({
                                where: { userId: user.id }
                            });
                        }
                    }
                }
            } catch (warmError) {
                console.error("Error warming devices cache:", warmError);
            }
        }

        const nowMs = Date.now();
        const devicesList = dbDevices.map(dev => {
            const lastSeenMs = dev.lastSeen.getTime();
            const diffHours = (nowMs - lastSeenMs) / (1000 * 60 * 60);

            let status: 'online' | 'warning' | 'offline' = 'online';
            if (diffHours > 72) {
                status = 'offline';
            } else if (diffHours > 36) {
                status = 'warning';
            }

            return {
                serialNumber: dev.serialNumber,
                name: dev.name,
                lastSeen: dev.lastSeen.toISOString(),
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
