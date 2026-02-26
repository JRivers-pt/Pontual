import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

// TEMPORARY diagnostic endpoint - REMOVE after debugging
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const password = searchParams.get('password');

    try {
        // 1. Test DB connection
        const userCount = await prisma.user.count();

        // 2. List all users (no passwords)
        const users = await prisma.user.findMany({
            select: { id: true, username: true, role: true, company: true, name: true }
        });

        // 3. If username provided, test lookup + password
        let authTest = null;
        if (username) {
            const normalizedUsername = username.toLowerCase();
            const user = await prisma.user.findUnique({
                where: { username: normalizedUsername }
            });

            if (user && password) {
                const passwordMatch = await bcrypt.compare(password, user.password);
                authTest = {
                    usernameSearched: normalizedUsername,
                    userFound: true,
                    passwordHashPrefix: user.password.substring(0, 10) + '...',
                    passwordMatch,
                    bcryptVersion: bcrypt.hashSync ? 'bcryptjs available' : 'bcryptjs missing',
                };
            } else if (user) {
                authTest = {
                    usernameSearched: normalizedUsername,
                    userFound: true,
                    passwordHashPrefix: user.password.substring(0, 10) + '...',
                    passwordMatch: 'not tested (no password provided)',
                };
            } else {
                authTest = {
                    usernameSearched: normalizedUsername,
                    userFound: false,
                };
            }
        }

        return NextResponse.json({
            status: 'ok',
            dbConnected: true,
            totalUsers: userCount,
            users,
            authTest,
            env: {
                hasAuthSecret: !!process.env.AUTH_SECRET,
                hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
                hasDatabaseUrl: !!process.env.DATABASE_URL,
                hasPostgresUrl: !!process.env.POSTGRES_PRISMA_URL,
                nodeEnv: process.env.NODE_ENV,
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 5),
        }, { status: 500 });
    }
}
