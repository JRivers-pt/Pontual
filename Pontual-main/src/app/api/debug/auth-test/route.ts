import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic endpoint - catches ALL errors
export async function GET(request: NextRequest) {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        env: {
            hasAuthSecret: !!process.env.AUTH_SECRET,
            hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
            hasDatabaseUrl: !!process.env.DATABASE_URL,
            hasPostgresUrl: !!process.env.POSTGRES_PRISMA_URL,
            databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) || 'NOT SET',
            postgresUrlPrefix: process.env.POSTGRES_PRISMA_URL?.substring(0, 30) || 'NOT SET',
            nodeEnv: process.env.NODE_ENV,
        }
    };

    // Test 1: Can we import Prisma?
    try {
        const { prisma } = await import('@/lib/db');
        diagnostics.prismaImport = 'ok';

        // Test 2: Can we query?
        try {
            const userCount = await prisma.user.count();
            diagnostics.dbConnection = 'ok';
            diagnostics.totalUsers = userCount;

            // Test 3: List users
            try {
                const users = await prisma.user.findMany({
                    select: { id: true, username: true, role: true, company: true, name: true }
                });
                diagnostics.users = users;
            } catch (e: any) {
                diagnostics.userListError = e.message;
            }

            // Test 4: Auth & VE deep diagnostic
            const { searchParams } = new URL(request.url);
            const username = searchParams.get('username') || 'VE';
            const password = searchParams.get('password');

            try {
                const veUser = await prisma.user.findFirst({
                    where: { username: { equals: username, mode: 'insensitive' } }
                });

                if (veUser) {
                    const [empCount, logCount, schedCount, auditCount] = await Promise.all([
                        prisma.employee.count({ where: { userId: veUser.id } }),
                        prisma.attendanceLog.count({ where: { userId: veUser.id } }),
                        prisma.schedule.count({ where: { userId: veUser.id } }),
                        prisma.auditLog.count({ where: { clientId: veUser.id } })
                    ]);

                    const sampleLogs = await prisma.attendanceLog.findMany({
                        where: { userId: veUser.id },
                        take: 5,
                        orderBy: { checktime: 'desc' }
                    });

                    const sampleEmployees = await prisma.employee.findMany({
                        where: { userId: veUser.id },
                        take: 5
                    });

                    let crosschexTest: any = null;
                    if (veUser.apiKey && veUser.apiSecret) {
                        try {
                            const ccRes = await fetch(veUser.apiUrl || 'https://api.eu.crosschexcloud.com/', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    header: {
                                        nameSpace: 'authorize.token',
                                        nameAction: 'token',
                                        version: '1.0',
                                        requestId: `${Date.now()}`,
                                        timestamp: new Date().toISOString()
                                    },
                                    payload: {
                                        api_key: veUser.apiKey,
                                        api_secret: veUser.apiSecret
                                    }
                                })
                            });
                            const ccData = await ccRes.json();
                            crosschexTest = {
                                status: ccRes.status,
                                ok: ccRes.ok,
                                data: ccData
                            };
                        } catch (ccErr: any) {
                            crosschexTest = { error: ccErr.message };
                        }
                    }

                    diagnostics.targetUserDiag = {
                        found: true,
                        id: veUser.id,
                        username: veUser.username,
                        company: veUser.company,
                        role: veUser.role,
                        parentUserId: veUser.parentUserId,
                        biometricProvider: veUser.biometricProvider,
                        hasApiKey: !!veUser.apiKey,
                        hasApiSecret: !!veUser.apiSecret,
                        apiUrl: veUser.apiUrl,
                        syncToken: veUser.syncToken,
                        empCount,
                        logCount,
                        schedCount,
                        auditCount,
                        sampleEmployees,
                        sampleLogs,
                        crosschexTest
                    };

                    if (password) {
                        const bcrypt = (await import('bcryptjs')).default;
                        const passwordMatch = await bcrypt.compare(password, veUser.password);
                        diagnostics.targetUserDiag.passwordMatch = passwordMatch;
                    }
                } else {
                    diagnostics.targetUserDiag = { found: false, username };
                }
            } catch (diagErr: any) {
                diagnostics.targetUserDiagError = diagErr.message;
            }
        } catch (e: any) {
            diagnostics.dbConnection = 'FAILED';
            diagnostics.dbError = e.message;
            diagnostics.dbErrorCode = e.code;
        }
    } catch (e: any) {
        diagnostics.prismaImport = 'FAILED';
        diagnostics.prismaError = e.message;
    }

    return NextResponse.json(diagnostics);
}
