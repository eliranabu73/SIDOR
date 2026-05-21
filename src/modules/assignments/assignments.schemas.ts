import { z } from 'zod';

export const AssignmentBodySchema = z.object({
  employeeId: z.string().uuid(),
  expectedShiftVersion: z.number().int().nonnegative(),
  expectedAssignmentVersion: z.number().int().nonnegative().optional(),
  action: z.enum(['assign', 'unassign', 'replace']),
  acknowledgeWarnings: z.boolean().optional().default(false),
});
export type AssignmentBody = z.infer<typeof AssignmentBodySchema>;

export const ShiftIdParam = z.object({ shiftId: z.string().uuid() });
