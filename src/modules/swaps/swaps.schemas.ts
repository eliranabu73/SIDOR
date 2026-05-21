import { z } from 'zod';

export const SwapIdParam = z.object({ swapId: z.string().uuid() });

export const SwapCreateBody = z.object({
  sourceAssignmentId: z.string().uuid(),
  requestingEmployeeId: z.string().uuid(),
  targetEmployeeId: z.string().uuid().nullable().optional(),
});
export type SwapCreateBody = z.infer<typeof SwapCreateBody>;

export const SwapApproveBody = z.object({
  /** Required by approver when acting AS an employee on an open-target swap. */
  approvingEmployeeId: z.string().uuid().optional(),
  /** Set true when a manager is finalizing the swap. */
  asManager: z.boolean().optional().default(false),
});
export type SwapApproveBody = z.infer<typeof SwapApproveBody>;

export const SwapRejectBody = z.object({
  reason: z.string().max(500).optional(),
});
export type SwapRejectBody = z.infer<typeof SwapRejectBody>;
