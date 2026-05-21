import type { Prisma, PrismaClient, DomainEventType } from '@prisma/client';
import { getRedis } from '../locks/redis';

export interface DomainEventInput {
  organizationId: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  userId?: string | null;
}

export async function writeEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  input: DomainEventInput,
): Promise<{ id: string }> {
  const created = await tx.scheduleEvent.create({
    data: {
      organizationId: input.organizationId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payloadJsonb: (input.payload ?? {}) as Prisma.InputJsonValue,
      createdByUserId: input.userId ?? null,
    },
    select: { id: true },
  });
  return created;
}

/** Fire-and-forget pubsub publish — call AFTER the DB transaction commits. */
export async function publishEvent(input: DomainEventInput & { id: string }): Promise<void> {
  try {
    const redis = getRedis();
    await redis.publish(
      `events:${input.organizationId}`,
      JSON.stringify({
        id: input.id,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload ?? {},
        userId: input.userId ?? null,
      }),
    );
  } catch {
    // never block the write path on broadcast
  }
}
