import type { Shift, Employee } from '@prisma/client';
import type { RuleResult } from '../rules/types';

/**
 * Signals that the ScoringService aggregates into a single 0..1 composite score.
 * Each signal is independently normalized to roughly [0,1] (with negative = bad).
 */
export interface CandidateSignals {
  /** Availability coverage ratio from the availability rule (0..1). */
  availabilityCoverage: number;
  /** Preference score in [-10..10], from EmployeeShiftPreference. */
  preferenceScore: number;
  /** Fairness z-score in [-3..3]. Negative = under-scheduled, prefer; positive = over, penalize. */
  fairnessScore: number;
  /** Distance between projected weekly minutes and preferred (smaller = better). */
  weeklyHoursDelta: number;
  /** How balanced this shift is for the employee's existing weekend distribution. */
  weekendShiftCount: number;
  /** Existing night-shift count this week (the more, the worse). */
  nightShiftCount: number;
  /** Whether the shift starts in a "night" local-time window. */
  isNightShift: boolean;
  /** Whether the shift falls on a Fri/Sat/Sun. */
  isWeekendShift: boolean;
}

export interface ScoringWeights {
  availability: number;
  preference: number;
  fairness: number;
  weeklyHoursBalance: number;
  weekendBalance: number;
  nightBalance: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  availability: 1.0, // hard signal — already gated by validator but used as a soft re-weight too
  preference: 0.5,
  fairness: 0.8,
  weeklyHoursBalance: 0.4,
  weekendBalance: 0.3,
  nightBalance: 0.3,
};

export interface AssignmentProposal {
  shiftId: string;
  employeeId: string;
  score: number;
  /** Per-signal contribution breakdown — useful for UI explanation. */
  breakdown: Record<keyof ScoringWeights, number>;
  /** Soft warnings carried over from the validator (warnings, not blocking). */
  warnings: RuleResult[];
  /** Reason this proposal was chosen over alternatives — diagnostic only. */
  reason?: string;
}

export interface SchedulerInput {
  scheduleId: string;
  /** When true, every assignment is dry-run only — caller will materialize later. */
  dryRun?: boolean;
  /** Optional override of scoring weights. */
  weights?: Partial<ScoringWeights>;
}

export interface CandidatePersistRow {
  organizationId: string;
  shiftId: string;
  employeeId: string;
  eligibilityScore: number;
  violationsCount: number;
  warningsCount: number;
}

export interface SchedulerOutput {
  scheduleId: string;
  proposals: AssignmentProposal[];
  /** Shifts that remained unfilled after the run. */
  unfilledShiftIds: string[];
  /** Stats — handy for telemetry. */
  stats: {
    totalShifts: number;
    totalCandidatesConsidered: number;
    proposalsGenerated: number;
    averageScore: number;
  };
  providerName: string;
  /** Candidate rows for persistence — populated by provider, consumed by route. */
  _candidateRows: CandidatePersistRow[];
}

/**
 * Strategy pattern — swap implementations without touching SchedulerService.
 * Future: ORToolsSchedulerProvider with the same interface.
 */
export interface SchedulerProvider {
  readonly name: string;
  run(input: SchedulerInput): Promise<SchedulerOutput>;
}

/** What CandidateGenerationService returns for a single (shift, employee) pair. */
export interface Candidate {
  shiftId: string;
  shift: Shift;
  employee: Employee;
  signals: CandidateSignals;
  /** Eligibility = passed all blocking rules. */
  eligible: boolean;
  /** Warning-level rules that didn't block but should surface. */
  warnings: RuleResult[];
  /** Blocking rules — present only when eligible === false (kept for debugging). */
  violations: RuleResult[];
}
