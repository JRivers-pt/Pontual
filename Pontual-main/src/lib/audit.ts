/**
 * Utilitario de Auditoria Pontual
 * Regista todas as acoes criticas (correcoes de ponto, insercoes manuais, eliminacoes, exportacoes)
 */

import { prisma } from '@/lib/db';

export type AuditAction =
  | 'CORRECTION'       // Correcao de hora
  | 'MANUAL_INSERT'    // Insercao manual de picagem
  | 'DELETE'           // Eliminacao de registo
  | 'LOGIN'            // Login na plataforma
  | 'EXPORT'           // Exportacao de relatorio PDF/Excel
  | 'VIEW'             // Consulta de dados
  | 'SCHEDULE_CHANGE'; // Mudanca de horario de colaborador

interface AuditOptions {
  actorId: string;          // ID do utilizador que fez a acao (ex: CMB1)
  actorName?: string;       // Username (ex: "CMB1")
  clientId: string;         // ID da conta pai (ex: ID do CMB)
  action: AuditAction;
  targetWorkno?: string;    // Numero mecanografico do colaborador visado
  targetName?: string;      // Nome do colaborador visado
  oldValue?: object | string;  // Valor anterior (objeto ou string)
  newValue?: object | string;  // Valor novo
  description?: string;        // Nota livre
  ipAddress?: string;
}

export async function writeAuditLog(opts: AuditOptions) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        actorName: opts.actorName,
        clientId: opts.clientId,
        action: opts.action,
        targetWorkno: opts.targetWorkno,
        targetName: opts.targetName,
        oldValue: opts.oldValue ? JSON.stringify(opts.oldValue) : null,
        newValue: opts.newValue ? JSON.stringify(opts.newValue) : null,
        description: opts.description,
        ipAddress: opts.ipAddress,
      }
    });
  } catch (err) {
    // Nao deixamos que uma falha de auditoria quebre o fluxo principal
    console.error('[AuditLog] Falha ao registar acao:', err);
  }
}

/**
 * Helper: resolve o clientId correto.
 * Se o utilizador for um sub-utilizador (CMB1, CMB2...), usa o parentUserId.
 * Se for o utilizador principal (CMB), usa o proprio ID.
 */
export function resolveClientId(user: { id: string; parentUserId?: string | null }): string {
  return user.parentUserId || user.id;
}
