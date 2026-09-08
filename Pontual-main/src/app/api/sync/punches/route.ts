import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-school-token') || request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing x-school-token header' }, { status: 401 });
    }

    // Find the client/school by syncToken
    const user = await prisma.user.findUnique({
      where: { syncToken: token }
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or unknown school token' }, { status: 403 });
    }

    const body = await request.json();
    const punches = body.punches || [];

    if (!Array.isArray(punches) || punches.length === 0) {
      return NextResponse.json({ success: true, message: 'No punches provided', count: 0 });
    }

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
          update: {}, // Do nothing if already exists
          create: {
            userId: user.id,
            workno: String(p.workno),
            employeeName: p.employeeName || null,
            checktime: new Date(p.checktime),
            checktype: Number(p.checktype) || 1,
            deviceName: p.deviceName || 'BioEntry W2',
            deviceSn: p.deviceSn || null,
            rawEventId: rawEventId
          }
        });
        inserted++;
      } catch (upsertErr) {
        // Continue on individual log conflict
      }
    }

    return NextResponse.json({
      success: true,
      school: user.company || user.name,
      processed: punches.length,
      inserted: inserted
    });

  } catch (error: any) {
    console.error('[Sync API Error]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
