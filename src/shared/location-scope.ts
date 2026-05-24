/**
 * location-scope.ts
 *
 * Returns a Prisma `where` fragment that restricts queries to a specific
 * location when the acting user is a BRANCH_MANAGER, or an empty object for
 * OWNER / MANAGER users (no extra filter applied).
 *
 * Usage:
 *   const scope = locationScope(req.user);
 *   const rows = await tx.schedule.findMany({
 *     where: { organizationId: orgId, ...scope },
 *   });
 */

/**
 * Minimal shape we need from the request user to compute the scope.
 * Compatible with the `req.user` type defined in src/modules/auth/types.ts.
 */
export interface ScopedUser {
  role: string;
  locationId?: string | null;
}

/**
 * Returns `{ locationId: <uuid> }` when the user is a BRANCH_MANAGER with a
 * valid locationId, otherwise returns `{}`.
 *
 * The returned object is safe to spread directly into any Prisma `where` clause
 * on a model that has a `locationId` column (Schedule, Shift, ShiftTemplate…).
 */
export function locationScope(user: ScopedUser): { locationId?: string } {
  if (
    (user.role === 'branch_manager' || user.role === 'BRANCH_MANAGER') &&
    user.locationId
  ) {
    return { locationId: user.locationId };
  }
  return {};
}

/**
 * Returns `{ defaultLocationId: <uuid> }` when the user is a BRANCH_MANAGER,
 * or `{}` otherwise. Use this variant for the Employee model which uses
 * `defaultLocationId` instead of `locationId`.
 */
export function employeeLocationScope(user: ScopedUser): { defaultLocationId?: string } {
  if (
    (user.role === 'branch_manager' || user.role === 'BRANCH_MANAGER') &&
    user.locationId
  ) {
    return { defaultLocationId: user.locationId };
  }
  return {};
}

/**
 * Returns true if the user is a BRANCH_MANAGER.
 */
export function isBranchManager(user: ScopedUser): boolean {
  return user.role === 'branch_manager' || user.role === 'BRANCH_MANAGER';
}
