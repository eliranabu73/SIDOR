import { z } from 'zod';

export const ShiftIdParam = z.object({ shiftId: z.string().uuid() });
export const ClaimIdParam = z.object({ claimId: z.string().uuid() });

export const ClaimCreateBody = z.object({
  employeeId: z.string().uuid(),
  acknowledgeWarnings: z.boolean().optional().default(false),
});
export type ClaimCreateBody = z.infer<typeof ClaimCreateBody>;

export const ClaimApproveBody = z.object({
  expectedShiftVersion: z.number().int().nonnegative().optional(),
});
export type ClaimApproveBody = z.infer<typeof ClaimApproveBody>;

export const ClaimRejectBody = z.object({
  reason: z.string().max(500).optional(),
});
export type ClaimRejectBody = z.infer<typeof ClaimRejectBody>;
