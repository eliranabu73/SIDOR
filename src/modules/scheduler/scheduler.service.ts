import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/prisma';
import { GreedySchedulerProvider } from './providers/greedy.provider';
import type {
  SchedulerInput,
  SchedulerOutput,
  SchedulerProvider,
} from './types';

export type ProviderName = 'greedy' | 'or-tools';

/**
 * SchedulerService — strategy-pattern orchestrator.
 *
 * Default provider is greedy. `or-tools` is reserved for a future adapter and
 * currently falls back to greedy with a warning, so the API contract is
 * stable when we ship the optimizer.
 */
export class SchedulerService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  pickProvider(name: ProviderName = 'greedy'): SchedulerProvider {
    switch (name) {
      case 'greedy':
        return new GreedySchedulerProvider(this.prisma);
      case 'or-tools':
        // TODO(phase-F): plug in ORToolsSchedulerProvider behind this branch.
        return new GreedySchedulerProvider(this.prisma);
      default:
        return new GreedySchedulerProvider(this.prisma);
    }
  }

  async run(
    input: SchedulerInput,
    providerName: ProviderName = 'greedy',
  ): Promise<SchedulerOutput> {
    const provider = this.pickProvider(providerName);
    return provider.run(input);
  }
}

export { type SchedulerInput, type SchedulerOutput, type AssignmentProposal } from './types';
