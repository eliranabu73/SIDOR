/**
 * Pure fairness-score computation.
 *
 * Returns the employee's z-score relative to their team's scheduled minutes,
 * clamped to [-3, 3]. Returns 0 when the team has fewer than 2 members or
 * when the standard deviation is 0 (everyone equal).
 */
export function computeFairnessScore(args: {
  employeeMinutes: number;
  teamMinutes: number[]; // including this employee
}): number {
  const { employeeMinutes, teamMinutes } = args;

  if (!Array.isArray(teamMinutes) || teamMinutes.length < 2) {
    return 0;
  }

  const n = teamMinutes.length;
  const mean = teamMinutes.reduce((acc, v) => acc + v, 0) / n;
  const variance =
    teamMinutes.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;
  const stdev = Math.sqrt(variance);

  if (stdev === 0) {
    return 0;
  }

  const z = (employeeMinutes - mean) / stdev;
  if (z > 3) return 3;
  if (z < -3) return -3;
  return z;
}
