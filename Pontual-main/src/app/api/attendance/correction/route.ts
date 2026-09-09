/**
 * API: Correcoes de Picagem + Insercao Manual
 * POST /api/attendance/correction  -> aplica correcao e regista auditoria
 * DELETE /api/attendance/correction -> elimina registo e regista auditoria
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { writeAuditLog, resolveClientId } from '@/lib/audit';

// Helper: retorna o IP do pedido (Vercel-aware)
function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Correcao ou insercao manual de picagem
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { logId, workno, employeeName, checktime, checktype, deviceName, description } = body;

    const clientId = resolveClientId(user);

    // ── CASO 1: Correção de registo existente ──
    if (logId) {
      const existing = await prisma.attendanceLog.findUnique({ where: { id: logId } });
      if (!existing || existing.userId !== clientId) {
        return NextResponse.json({ error: 'Registo nao encontrado ou sem permissao' }, { status: 404 });
      }

      const updated = await prisma.attendanceLog.update({
        where: { id: logId },
        data: {
          checktime: checktime ? new Date(checktime) : existing.checktime,
          checktype: checktype !== undefined ? Number(checktype) : existing.checktype,
          deviceName: deviceName || existing.deviceName,
        }
      });

      await writeAuditLog({
        actorId: user.id,
        actorName: user.username,
        clientId,
        action: 'CORRECTION',
        targetWorkno: existing.workno,
        targetName: existing.employeeName || undefined,
        oldValue: {
          checktime: existing.checktime.toISOString(),
          checktype: existing.checktype,
          deviceName: existing.deviceName
        },
        newValue: {
          checktime: updated.checktime.toISOString(),
          checktype: updated.checktype,
          deviceName: updated.deviceName
        },
        description: description || `Correcao de picagem - ${existing.employeeName || existing.workno}`,
        ipAddress: getIp(request)
      });

      return NextResponse.json({ success: true, log: updated });
    }

    // ── CASO 2: Insercao manual de nova picagem ──
    if (!workno || !checktime) {
      return NextResponse.json({ error: 'workno e checktime sao obrigatorios para insercao manual' }, { status: 400 });
    }

    const newLog = await prisma.attendanceLog.create({
      data: {
        userId: clientId,
        workno: String(workno),
        employeeName: employeeName || null,
        checktime: new Date(checktime),
        checktype: checktype !== undefined ? Number(checktype) : 1,
        deviceName: deviceName || 'Insercao Manual',
        rawEventId: `manual_${Date.now()}_${workno}`,
      }
    });

    await writeAuditLog({
      actorId: user.id,
      actorName: user.username,
      clientId,
      action: 'MANUAL_INSERT',
      targetWorkno: workno,
      targetName: employeeName || undefined,
      newValue: {
        checktime: newLog.checktime.toISOString(),
        checktype: newLog.checktype,
        deviceName: newLog.deviceName
      },
      description: description || `Insercao manual - ${employeeName || workno}`,
      ipAddress: getIp(request)
    });

    return NextResponse.json({ success: true, log: newLog });

  } catch (err: any) {
    console.error('[Correction API]', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: Eliminar picagem
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { logId, description } = await request.json();
    if (!logId) return NextResponse.json({ error: 'logId e obrigatorio' }, { status: 400 });

    const clientId = resolveClientId(user);
    const existing = await prisma.attendanceLog.findUnique({ where: { id: logId } });

    if (!existing || existing.userId !== clientId) {
      return NextResponse.json({ error: 'Registo nao encontrado ou sem permissao' }, { status: 404 });
    }

    await prisma.attendanceLog.delete({ where: { id: logId } });

    await writeAuditLog({
      actorId: user.id,
      actorName: user.username,
      clientId,
      action: 'DELETE',
      targetWorkno: existing.workno,
      targetName: existing.employeeName || undefined,
      oldValue: {
        checktime: existing.checktime.toISOString(),
        checktype: existing.checktype,
        deviceName: existing.deviceName
      },
      description: description || `Eliminacao de picagem - ${existing.employeeName || existing.workno}`,
      ipAddress: getIp(request)
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[Correction DELETE]', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
