import { prisma } from '../../../db/prisma';
import type {
  ScheduleExportData,
  ExportShiftRow,
  ExportEmployeeRow,
} from './types';

/**
 * Load all data needed to render a schedule export (PNG/PDF) for a given
 * schedule, scoped to an organization. Returns a shape the templates can
 * consume without further DB hits.
 *
 * If the schedule does not exist OR the id is not a UUID (e.g. demo pseudo
 * ids like "sched_2026-05-17"), returns a demo-shaped fixture so the
 * export endpoints still produce something useful for screenshots.
 */
export async function loadScheduleExportData(
  scheduleId: string,
  organizationId: string,
): Promise<ScheduleExportData> {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!UUID_RE.test(scheduleId)) {
    return buildDemoFixture(scheduleId);
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, organizationId },
    include: {
      shifts: {
        include: {
          role: true,
          location: true,
          assignments: {
            include: { employee: { select: { id: true, fullName: true } } },
          },
        },
        orderBy: { startAtUtc: 'asc' },
      },
    },
  });

  if (!schedule) {
    return buildDemoFixture(scheduleId);
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  const employees = await prisma.employee.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  const weekStartDate = schedule.periodStartDate;
  const weekEndDate = new Date(weekStartDate.getTime() + 6 * 86400000);

  const shifts: ExportShiftRow[] = schedule.shifts.map((s) => ({
    id: s.id,
    startsAt: s.startAtUtc.toISOString(),
    endsAt: s.endAtUtc.toISOString(),
    role: s.role?.name ?? null,
    location: s.location?.name ?? null,
    requiredCount: s.requiredEmployeeCount,
    employeeNames: s.assignments
      .filter((a) => a.assignmentStatus !== 'CANCELLED' && a.assignmentStatus !== 'DECLINED')
      .map((a) => a.employee?.fullName ?? '—'),
  }));

  const empRows: ExportEmployeeRow[] = employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
  }));

  return {
    orgName: org?.name ?? 'הארגון שלי',
    weekStart: weekStartDate.toISOString().slice(0, 10),
    weekEnd: weekEndDate.toISOString().slice(0, 10),
    scheduleId: schedule.id,
    shifts,
    employees: empRows,
  };
}

function buildDemoFixture(scheduleId: string): ScheduleExportData {
  // Sunday-based week starting today (UTC).
  const now = new Date();
  const day = now.getUTCDay();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - day);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);

  const employees: ExportEmployeeRow[] = [
    { id: 'e1', fullName: 'דנה כהן' },
    { id: 'e2', fullName: 'יוסי לוי' },
    { id: 'e3', fullName: 'מאיה שפירא' },
    { id: 'e4', fullName: 'אבי ברק' },
    { id: 'e5', fullName: 'נועה פרץ' },
  ];

  const roles = ['קופה', 'מלצרות', 'מטבח'];
  const shifts: ExportShiftRow[] = [];
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(weekStart.getTime() + d * 86400000);
    // Morning + evening shift
    const morningStart = new Date(dayStart);
    morningStart.setUTCHours(8, 0, 0, 0);
    const morningEnd = new Date(dayStart);
    morningEnd.setUTCHours(15, 0, 0, 0);
    const eveStart = new Date(dayStart);
    eveStart.setUTCHours(15, 0, 0, 0);
    const eveEnd = new Date(dayStart);
    eveEnd.setUTCHours(23, 0, 0, 0);

    shifts.push({
      id: `demo-m-${d}`,
      startsAt: morningStart.toISOString(),
      endsAt: morningEnd.toISOString(),
      role: roles[d % roles.length] ?? 'קופה',
      location: 'סניף ראשי',
      requiredCount: 2,
      employeeNames: [
        employees[(d * 2) % employees.length]!.fullName,
        employees[(d * 2 + 1) % employees.length]!.fullName,
      ],
    });
    shifts.push({
      id: `demo-e-${d}`,
      startsAt: eveStart.toISOString(),
      endsAt: eveEnd.toISOString(),
      role: roles[(d + 1) % roles.length] ?? 'מלצרות',
      location: 'סניף ראשי',
      requiredCount: 2,
      employeeNames: [
        employees[(d * 2 + 2) % employees.length]!.fullName,
        employees[(d * 2 + 3) % employees.length]!.fullName,
      ],
    });
  }

  return {
    orgName: 'סידור4S — דמו',
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    scheduleId,
    shifts,
    employees,
  };
}
