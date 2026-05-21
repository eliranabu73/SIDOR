/**
 * Heavy-rules background worker.
 *
 * Subscribes to Redis `events:*` channels and recomputes employee fairness
 * scores when shift-assignment events arrive.
 *
 * NOTE FOR ORCHESTRATOR: please add the following entry to package.json scripts:
 *   "worker": "tsx src/workers/heavy-rules.worker.ts"
 *
 * Runs as a standalone process; safe no-op when REDIS_URL is empty (dev).
 */

import Redis from 'ioredis';
import { DateTime } from 'luxon';
import pino from 'pino';
import { prisma } from '../db/prisma';
import { computeFairnessScore } from './fairness';

const logger = pino({ name: 'heavy-rules.worker' });

const RELEVANT_EVENT_TYPES = new Set<string>([
  'SHIFT_ASSIGNED',
  'SHIFT_UNASSIGNED',
  'SHIFT_REPLACED',
]);

const DEBOUNCE_MS = 2_000;

interface DomainEvent {
  id?: string;
  eventType: string;
  aggregateType?: string;
  aggregateId: string; // shiftId
  payload: { employeeId: string; assignmentId?: string };
  userId?: string;
}

function parseOrgIdFromChannel(channel: string): string | null {
  // channel format: events:{orgId}
  const idx = channel.indexOf(':');
  if (idx < 0) return null;
  const orgId = channel.slice(idx + 1);
  return orgId.length > 0 ? orgId : null;
}

async function recomputeFairnessForEmployee(args: {
  organizationId: string;
  employeeId: string;
  shiftId: string;
}): Promise<void> {
  const { organizationId, employeeId, shiftId } = args;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { startAtUtc: true, timezone: true, organizationId: true },
  });

  if (!shift) {
    logger.warn({ shiftId }, 'shift not found, skipping fairness recompute');
    return;
  }

  const weekStart = DateTime.fromJSDate(shift.startAtUtc)
    .setZone(shift.timezone)
    .startOf('week')
    .toJSDate();

  const metricsRows = await prisma.employeeScheduleMetrics.findMany({
    where: {
      organizationId,
      weekStartDate: weekStart,
    },
    select: {
      id: true,
      employeeId: true,
      totalScheduledMinutes: true,
    },
  });

  if (metricsRows.length === 0) {
    logger.debug(
      { organizationId, employeeId, weekStart },
      'no metrics rows for week, skipping',
    );
    return;
  }

  const target = metricsRows.find((r) => r.employeeId === employeeId);
  if (!target) {
    logger.debug(
      { organizationId, employeeId, weekStart },
      'employee has no metrics row this week, skipping',
    );
    return;
  }

  const teamMinutes = metricsRows.map((r) => r.totalScheduledMinutes);
  const fairnessScore = computeFairnessScore({
    employeeMinutes: target.totalScheduledMinutes,
    teamMinutes,
  });

  await prisma.employeeScheduleMetrics.update({
    where: { id: target.id },
    data: { fairnessScore },
  });

  logger.info(
    {
      organizationId,
      employeeId,
      shiftId,
      weekStart,
      teamSize: teamMinutes.length,
      employeeMinutes: target.totalScheduledMinutes,
      fairnessScore,
    },
    'recomputed fairness score',
  );
}

function makeDebouncer(): (key: string, fn: () => Promise<void>) => void {
  const pending = new Map<string, NodeJS.Timeout>();
  return (key, fn) => {
    const existing = pending.get(key);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      pending.delete(key);
      fn().catch((err) => {
        logger.error({ err, key }, 'debounced task failed');
      });
    }, DEBOUNCE_MS);
    pending.set(key, handle);
  };
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('no REDIS_URL — exiting');
    process.exit(0);
  }

  const subscriber = new Redis(redisUrl);
  const debounce = makeDebouncer();

  subscriber.on('error', (err) => {
    logger.error({ err }, 'redis subscriber error');
  });

  await subscriber.psubscribe('events:*');
  logger.info('subscribed to events:* — worker ready');

  subscriber.on('pmessage', (_pattern, channel, message) => {
    let event: DomainEvent;
    try {
      event = JSON.parse(message) as DomainEvent;
    } catch (err) {
      logger.warn({ err, channel }, 'failed to parse event payload');
      return;
    }

    if (!RELEVANT_EVENT_TYPES.has(event.eventType)) {
      return;
    }

    const organizationId = parseOrgIdFromChannel(channel);
    if (!organizationId) {
      logger.warn({ channel }, 'could not parse orgId from channel');
      return;
    }

    const employeeId = event.payload?.employeeId;
    const shiftId = event.aggregateId;
    if (!employeeId || !shiftId) {
      logger.warn({ channel, event }, 'event missing employeeId or shiftId');
      return;
    }

    debounce(`${organizationId}:${employeeId}`, () =>
      recomputeFairnessForEmployee({ organizationId, employeeId, shiftId }),
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await subscriber.punsubscribe('events:*');
      subscriber.disconnect();
    } catch (err) {
      logger.warn({ err }, 'error while disconnecting redis');
    }
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.warn({ err }, 'error while disconnecting prisma');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'worker crashed');
  process.exit(1);
});
