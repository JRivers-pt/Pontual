import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    // Warm up the database connection (Neon cold start fix)
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
        // DB warmup failed, but endpoint still works
    }
    const dbTime = Date.now() - start;

    return NextResponse.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dbWarmupMs: dbTime,
        message: 'Keep-alive ping successful'
    });
}
