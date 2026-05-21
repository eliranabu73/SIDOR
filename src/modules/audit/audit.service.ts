import type { Prisma, PrismaClient, AuditActionType } from '@prisma/client';

export interface AuditInput {
  organizationId: string;
  scheduleId?: string | null;
  userId?: string | null;
  actionType: AuditActionType;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  tx: Prisma.TransactionClient | PrismaClient,
  input: AuditInput,
): Promise<void> {
  await tx.scheduleAuditLog.create({
    data: {
      organizationId: input.organizationId,
      scheduleId: input.scheduleId ?? null,
      userId: input.userId ?? null,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeDataJsonb:
        input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
      afterDataJsonb:
        input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
    },
  });
}
