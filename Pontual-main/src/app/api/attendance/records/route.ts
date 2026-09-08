import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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

        // If client is using Suprema / Local Sync Agent
        if (user.biometricProvider === 'SUPREMA') {
            const whereClause: any = { userId: user.id };
            
            if (beginTime || endTime) {
                whereClause.checktime = {};
                if (beginTime) whereClause.checktime.gte = new Date(beginTime);
                if (endTime) whereClause.checktime.lte = new Date(endTime);
            }

            const totalCount = await prisma.attendanceLog.count({ where: whereClause });
            const logs = await prisma.attendanceLog.findMany({
                where: whereClause,
                orderBy: { checktime: 'asc' },
                skip: (page - 1) * perPage,
                take: perPage
            });

            return NextResponse.json({
                header: {
                    nameSpace: 'attendance.record',
                    nameAction: 'getrecord',
                    version: '1.0',
                    requestId: generateRequestId(),
                    timestamp: generateTimestamp()
                },
                payload: {
                    count: totalCount,
                    list: logs.map(l => ({
                        uuid: l.id,
                        checktype: l.checktype,
                        checktime: l.checktime.toISOString(),
                        device: {
                            serial_number: l.deviceSn || 'BioEntry_W2',
                            name: l.deviceName || 'BioEntry W2'
                        },
                        employee: {
                            first_name: l.employeeName || 'Colaborador',
                            last_name: '',
                            workno: l.workno
                        }
                    })),
                    page: page,
                    perPage: perPage,
                    pageCount: Math.ceil(totalCount / perPage) || 1
                }
            });
        }

        // Default: Anviz CrossChex Cloud API
        if (!token) {
            return NextResponse.json(
                { error: 'Token is required' },
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

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching attendance records:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch records' },
            { status: 500 }
        );
    }
}
