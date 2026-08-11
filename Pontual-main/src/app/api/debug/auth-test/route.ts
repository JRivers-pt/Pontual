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

            // Test 4: Auth test
            const { searchParams } = new URL(request.url);
            const username = searchParams.get('username');
            const password = searchParams.get('password');

            if (username && password) {
                try {
                    const bcrypt = (await import('bcryptjs')).default;
                    const normalizedUsername = username.toLowerCase();
                    const user = await prisma.user.findUnique({
                        where: { username: normalizedUsername }
                    });

                    if (user) {
                        const passwordMatch = await bcrypt.compare(password, user.password);
                        diagnostics.authTest = {
                            usernameSearched: normalizedUsername,
                            userFound: true,
                            hashPrefix: user.password.substring(0, 7),
                            passwordMatch,
                        };
                    } else {
                        diagnostics.authTest = {
                            usernameSearched: normalizedUsername,
                            userFound: false,
                        };
                    }
                } catch (e: any) {
                    diagnostics.authTestError = e.message;
                }
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
