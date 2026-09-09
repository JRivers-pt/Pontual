/**
 * API: Consulta do Registo de Auditoria
 * GET /api/admin/audit?page=1&perPage=50&action=CORRECTION&actorName=CMB1
 * Apenas acessivel ao ADMIN ou ao login principal do cliente (CMB, nao CMB1)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Apenas a conta principal (sem parentUserId) ou ADMIN pode ver os logs
    if (user.parentUserId && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Apenas a conta principal ou Administrador pode consultar os logs de auditoria.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('perPage') || '50');
    const action = searchParams.get('action') || undefined;
    const actorName = searchParams.get('actorName') || undefined;
    const targetWorkno = searchParams.get('targetWorkno') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    // ADMIN ve tudo; cliente ve apenas os seus proprios logs
    const clientId = user.role === 'ADMIN' ? undefined : user.id;

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (action) where.action = action;
    if (actorName) where.actorName = { contains: actorName, mode: 'insensitive' };
    if (targetWorkno) where.targetWorkno = { contains: targetWorkno };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      })
    ]);

    return NextResponse.json({
      total,
      page,
      perPage,
      pageCount: Math.ceil(total / perPage) || 1,
      logs: logs.map(l => ({
        id: l.id,
        actorName: l.actorName,
        action: l.action,
        targetWorkno: l.targetWorkno,
        targetName: l.targetName,
        oldValue: l.oldValue ? JSON.parse(l.oldValue) : null,
        newValue: l.newValue ? JSON.parse(l.newValue) : null,
        description: l.description,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt.toISOString(),
      }))
    });

  } catch (err: any) {
    console.error('[Audit API]', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
