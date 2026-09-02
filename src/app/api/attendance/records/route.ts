import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { crossChexErrorToPortuguese } from '@/lib/api-server';

function generateTimestamp(): string {
    return new Date().toISOString().replace('Z', '+00:00');
}

function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { token, beginTime, endTime, page = 1, perPage = 100 } = body;

        if (!token) {
            return NextResponse.json(
                { error: 'Sessão inválida. Termina a sessão e inicia novamente.' },
                { status: 400 }
            );
        }

        const requestBody = {
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
                begin_time: beginTime,
                end_time: endTime,
                order: 'asc',
                page: page,
                per_page: perPage
            }
        };

        const response = await fetch(user.apiUrl || 'https://api.eu.crosschexcloud.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data) {
            throw new Error(crossChexErrorToPortuguese(response.status, data));
        }

        // Query manual missed punches from database and merge them into records list
        try {
            const missedPunches = await prisma.missedPunch.findMany({
                where: {
                    userId: user.id,
                    checktime: {
                        gte: new Date(beginTime),
                        lte: new Date(endTime)
                    }
                }
            });

            if (missedPunches.length > 0 && data.payload) {
                const mappedMissed = missedPunches.map(punch => ({
                    uuid: `manual-${punch.id}`,
                    checktype: punch.checktype,
                    checktime: punch.checktime.toISOString().replace('Z', '+00:00'),
                    device: {
                        serial_number: 'MANUAL',
                        name: punch.device
                    },
                    employee: {
                        first_name: punch.firstName,
                        last_name: punch.lastName,
                        workno: punch.workno
                    }
                }));

                const apiRecords = data.payload.list || [];
                const combinedRecords = [...apiRecords, ...mappedMissed];

                const sortOrder = body.order || 'asc';
                combinedRecords.sort((a: any, b: any) => {
                    const timeA = new Date(a.checktime).getTime();
                    const timeB = new Date(b.checktime).getTime();
                    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                });

                data.payload.list = combinedRecords;
                data.payload.count = combinedRecords.length;
            }
        } catch (dbError) {
            console.error('Error merging missed punches:', dbError);
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching attendance records:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch records' },
            { status: 500 }
        );
    }
}
