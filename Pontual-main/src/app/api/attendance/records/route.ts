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
        const token = request.headers.get('x-school-token') || request.headers.get('authorization')?.replace('Bearer ', '');
        
        let user: any = null;

        if (token) {
            user = await prisma.user.findUnique({
                where: { syncToken: token }
            });
            if (!user) {
                return NextResponse.json({ error: 'Invalid school token' }, { status: 403 });
            }
        } else {
            const session = await auth();

            if (!session?.user?.id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            user = await prisma.user.findUnique({
                where: { id: session.user.id }
            });

            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
        }

        const body = await request.json();
        const { token: _t, beginTime, endTime, page = 1, perPage = 100, punches } = body;

        // If agent is syncing punches via this endpoint
        if (Array.isArray(punches) && punches.length > 0) {
            let inserted = 0;
            for (const p of punches) {
                if (!p.checktime || !p.workno) continue;
                const rawEventId = p.rawEventId ? String(p.rawEventId) : `${p.workno}-${new Date(p.checktime).getTime()}`;
                try {
                    await prisma.attendanceLog.upsert({
                        where: {
                            userId_rawEventId: {
                                userId: user.id,
                                rawEventId: rawEventId
                            }
                        },
                        update: {},
                        create: {
                            userId: user.id,
                            workno: String(p.workno),
                            employeeName: p.employeeName || null,
                            checktime: new Date(p.checktime),
                            checktype: Number(p.checktype) || 1,
                            deviceName: p.deviceName || 'CardPass3 Terminal',
                            deviceSn: p.deviceSn || null,
                            rawEventId: rawEventId
                        }
                    });
                    inserted++;
                } catch (e) {}
            }
            return NextResponse.json({ success: true, school: user.company || user.name, inserted });
        }

        // If client is using Suprema / Local Sync Agent
        const effectiveUserId = user.parentUserId || user.id;
        const isSupremaClient = user.biometricProvider === 'SUPREMA' || user.company?.includes('Manuel Bernardes') || user.company?.includes('Maristas');

        if (isSupremaClient || user.biometricProvider === 'SUPREMA') {
            const whereClause: any = { userId: effectiveUserId };
            
            if (beginTime || endTime) {
                whereClause.checktime = {};
                if (beginTime) whereClause.checktime.gte = new Date(beginTime);
                if (endTime) whereClause.checktime.lte = new Date(endTime);
            }

            const [totalCount, logs, employees] = await Promise.all([
                prisma.attendanceLog.count({ where: whereClause }),
                prisma.attendanceLog.findMany({
                    where: whereClause,
                    orderBy: { checktime: 'asc' },
                    skip: (page - 1) * perPage,
                    take: perPage
                }),
                prisma.employee.findMany({
                    where: { userId: effectiveUserId },
                    select: { workno: true, name: true }
                })
            ]);

            const empNameMap = new Map<string, string>();
            employees.forEach(e => {
                empNameMap.set(e.workno, e.name);
                empNameMap.set(e.workno.padStart(4, '0'), e.name);
                empNameMap.set(e.workno.replace(/^0+/, ''), e.name);
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
                    list: logs.map(l => {
                        const fullName = empNameMap.get(l.workno) || 
                                         empNameMap.get(l.workno.padStart(4, '0')) || 
                                         empNameMap.get(l.workno.replace(/^0+/, '')) || 
                                         l.employeeName || 
                                         `Colaborador ${l.workno}`;
                        return {
                            uuid: l.id,
                            checktype: l.checktype,
                            checktime: l.checktime.toISOString(),
                            device: {
                                serial_number: l.deviceSn || 'BioEntry_W2',
                                name: l.deviceName || 'BioEntry W2'
                            },
                            employee: {
                                first_name: fullName,
                                last_name: '',
                                workno: l.workno.padStart(4, '0')
                            }
                        };
                    }),
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
