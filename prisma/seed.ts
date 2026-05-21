/**
 * sidor4S — Demo data seed script
 *
 * Idempotent: every entity is upserted by a deterministic UUID, so running
 * this multiple times keeps the same IDs and never duplicates rows.
 *
 * Run with:
 *   npx tsx prisma/seed.ts
 *   # or
 *   npx prisma db seed
 */

import {
  AssignmentSource,
  AssignmentStatus,
  AvailabilityType,
  EmploymentType,
  PrismaClient,
  ScheduleStatus,
  ShiftStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

const TZ = 'Asia/Jerusalem';

// =========================================================
// Deterministic UUIDs (so re-running is idempotent)
// =========================================================

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const LOCATION_ID = '10000000-0000-0000-0000-000000000010';

const ROLE_IDS = {
  waitress: '10000000-0000-0000-0000-000000000101',
  bartender: '10000000-0000-0000-0000-000000000102',
  cook: '10000000-0000-0000-0000-000000000103',
  shiftManager: '10000000-0000-0000-0000-000000000104',
  cashier: '10000000-0000-0000-0000-000000000105',
  dishwasher: '10000000-0000-0000-0000-000000000106',
} as const;

interface EmployeeSeed {
  id: string;
  fullName: string;
  email: string;
  employmentType: EmploymentType;
  roles: ReadonlyArray<keyof typeof ROLE_IDS>;
  availability: ReadonlyArray<{
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
  }>;
}

const EMPLOYEES: ReadonlyArray<EmployeeSeed> = [
  {
    id: '10000000-0000-0000-0000-000000000201',
    fullName: 'דנה כהן',
    email: 'dana.cohen@demo.sidor4s.local',
    employmentType: EmploymentType.FULL_TIME,
    roles: ['waitress', 'bartender'],
    availability: [
      { dayOfWeek: 0, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 1, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 2, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 3, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 4, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000202',
    fullName: 'יוסי לוי',
    email: 'yossi.levi@demo.sidor4s.local',
    employmentType: EmploymentType.FULL_TIME,
    roles: ['shiftManager'],
    availability: [
      { dayOfWeek: 0, startLocalTime: '08:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 2, startLocalTime: '08:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 4, startLocalTime: '08:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 5, startLocalTime: '08:00:00', endLocalTime: '23:59:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000203',
    fullName: 'מאיה בן-דוד',
    email: 'maya.bendavid@demo.sidor4s.local',
    employmentType: EmploymentType.PART_TIME,
    roles: ['waitress'],
    availability: [
      { dayOfWeek: 1, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
      { dayOfWeek: 3, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
      { dayOfWeek: 5, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000204',
    fullName: 'אורי שמש',
    email: 'uri.shemesh@demo.sidor4s.local',
    employmentType: EmploymentType.FULL_TIME,
    roles: ['cook', 'shiftManager'],
    availability: [
      { dayOfWeek: 0, startLocalTime: '15:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 1, startLocalTime: '00:00:00', endLocalTime: '02:00:00' },
      { dayOfWeek: 1, startLocalTime: '15:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 2, startLocalTime: '00:00:00', endLocalTime: '02:00:00' },
      { dayOfWeek: 3, startLocalTime: '15:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 4, startLocalTime: '00:00:00', endLocalTime: '02:00:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000205',
    fullName: 'תמר רוזן',
    email: 'tamar.rosen@demo.sidor4s.local',
    employmentType: EmploymentType.PART_TIME,
    roles: ['bartender', 'waitress'],
    availability: [
      { dayOfWeek: 2, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 4, startLocalTime: '16:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 5, startLocalTime: '12:00:00', endLocalTime: '23:59:00' },
      { dayOfWeek: 6, startLocalTime: '12:00:00', endLocalTime: '23:59:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000206',
    fullName: 'נועה ברק',
    email: 'noa.barak@demo.sidor4s.local',
    employmentType: EmploymentType.PART_TIME,
    roles: ['cashier'],
    availability: [
      { dayOfWeek: 0, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
      { dayOfWeek: 1, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
      { dayOfWeek: 3, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
      { dayOfWeek: 5, startLocalTime: '09:00:00', endLocalTime: '17:00:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000207',
    fullName: 'איל בכר',
    email: 'eyal.bachar@demo.sidor4s.local',
    employmentType: EmploymentType.FULL_TIME,
    roles: ['cook'],
    availability: [
      { dayOfWeek: 0, startLocalTime: '08:00:00', endLocalTime: '18:00:00' },
      { dayOfWeek: 2, startLocalTime: '08:00:00', endLocalTime: '18:00:00' },
      { dayOfWeek: 3, startLocalTime: '08:00:00', endLocalTime: '18:00:00' },
      { dayOfWeek: 5, startLocalTime: '08:00:00', endLocalTime: '18:00:00' },
    ],
  },
  {
    id: '10000000-0000-0000-0000-000000000208',
    fullName: 'שירה ים',
    email: 'shira.yam@demo.sidor4s.local',
    employmentType: EmploymentType.PART_TIME,
    roles: ['dishwasher', 'waitress'],
    availability: [
      { dayOfWeek: 1, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
      { dayOfWeek: 2, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
      { dayOfWeek: 3, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
      { dayOfWeek: 4, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
      { dayOfWeek: 5, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
      { dayOfWeek: 6, startLocalTime: '06:00:00', endLocalTime: '14:00:00' },
    ],
  },
];

interface DailyShiftSeed {
  slotIndex: number; // 0..3, deterministic UUID suffix
  roleKey: keyof typeof ROLE_IDS;
  startLocalHour: number;
  startLocalMinute: number;
  endLocalHour: number;
  endLocalMinute: number;
  crossesMidnight: boolean;
  requiredCount: number;
  // Index into EMPLOYEES of who to assign (empty = unassigned/open).
  assigneeIdxs: ReadonlyArray<number>;
}

const DAILY_SHIFTS: ReadonlyArray<DailyShiftSeed> = [
  {
    slotIndex: 0,
    roleKey: 'waitress',
    startLocalHour: 9,
    startLocalMinute: 0,
    endLocalHour: 17,
    endLocalMinute: 0,
    crossesMidnight: false,
    requiredCount: 2,
    assigneeIdxs: [2, 7], // מאיה, שירה
  },
  {
    slotIndex: 1,
    roleKey: 'cashier',
    startLocalHour: 9,
    startLocalMinute: 0,
    endLocalHour: 17,
    endLocalMinute: 0,
    crossesMidnight: false,
    requiredCount: 1,
    assigneeIdxs: [5], // נועה
  },
  {
    slotIndex: 2,
    roleKey: 'bartender',
    startLocalHour: 16,
    startLocalMinute: 0,
    endLocalHour: 23,
    endLocalMinute: 0,
    crossesMidnight: false,
    requiredCount: 1,
    assigneeIdxs: [0], // דנה
  },
  {
    slotIndex: 3,
    roleKey: 'cook',
    startLocalHour: 17,
    startLocalMinute: 0,
    endLocalHour: 1,
    endLocalMinute: 0,
    crossesMidnight: true,
    requiredCount: 1,
    assigneeIdxs: [3], // אורי
  },
];

function shiftUuid(dayIdx: number, slotIdx: number): string {
  // Deterministic per (week, day, slot). Week-relative is fine: re-seeding
  // the same week replaces the same shift IDs.
  const day = dayIdx.toString().padStart(2, '0');
  const slot = slotIdx.toString().padStart(2, '0');
  return `10000000-0000-0000-0000-0000003${day}${slot}00`;
}

function assignmentUuid(dayIdx: number, slotIdx: number, empIdx: number): string {
  const day = dayIdx.toString().padStart(2, '0');
  const slot = slotIdx.toString().padStart(2, '0');
  const emp = empIdx.toString().padStart(2, '0');
  return `10000000-0000-0000-0000-00000040${day}${slot}${emp}`;
}

function availabilityUuid(empIdx: number, ruleIdx: number): string {
  const emp = empIdx.toString().padStart(2, '0');
  const rule = ruleIdx.toString().padStart(2, '0');
  return `10000000-0000-0000-0000-0000005000${emp}${rule}`;
}

function employeeRoleUuid(empIdx: number, roleIdx: number): string {
  const emp = empIdx.toString().padStart(2, '0');
  const role = roleIdx.toString().padStart(2, '0');
  return `10000000-0000-0000-0000-000000600${emp}${role}`;
}

function metricsUuid(empIdx: number): string {
  const emp = empIdx.toString().padStart(2, '0');
  return `10000000-0000-0000-0000-0000007000${emp}00`;
}

const SCHEDULE_ID = '10000000-0000-0000-0000-000000000300';

async function main(): Promise<void> {
  // -------- Organization --------
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {
      name: 'מסעדת אלירן',
      defaultTimezone: TZ,
      weekStartDay: 0,
      laborRulesJsonb: {
        maxHoursPerDay: 12,
        maxHoursPerWeek: 45,
        minRestHoursBetweenShifts: 8,
        overtimeAfterDailyHours: 8,
        overtimeAfterWeeklyHours: 42,
        allowOvertimeWithWarning: true,
        requireRoleMatch: true,
        requireAvailability: true,
      },
    },
    create: {
      id: ORG_ID,
      name: 'מסעדת אלירן',
      defaultTimezone: TZ,
      weekStartDay: 0,
      laborRulesJsonb: {
        maxHoursPerDay: 12,
        maxHoursPerWeek: 45,
        minRestHoursBetweenShifts: 8,
        overtimeAfterDailyHours: 8,
        overtimeAfterWeeklyHours: 42,
        allowOvertimeWithWarning: true,
        requireRoleMatch: true,
        requireAvailability: true,
      },
    },
  });
  console.log('✓ org');

  // -------- Location --------
  await prisma.location.upsert({
    where: { id: LOCATION_ID },
    update: {
      name: 'סניף תל אביב',
      timezone: TZ,
      isActive: true,
    },
    create: {
      id: LOCATION_ID,
      organizationId: ORG_ID,
      name: 'סניף תל אביב',
      timezone: TZ,
      isActive: true,
    },
  });
  console.log('✓ location');

  // -------- Roles --------
  const roleDefs: ReadonlyArray<{ id: string; name: string }> = [
    { id: ROLE_IDS.waitress, name: 'מלצרית' },
    { id: ROLE_IDS.bartender, name: 'ברמנית' },
    { id: ROLE_IDS.cook, name: 'טבח' },
    { id: ROLE_IDS.shiftManager, name: 'מנהל משמרת' },
    { id: ROLE_IDS.cashier, name: 'קופאית' },
    { id: ROLE_IDS.dishwasher, name: 'רחיצה' },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({
      where: { id: r.id },
      update: { name: r.name },
      create: { id: r.id, organizationId: ORG_ID, name: r.name },
    });
  }
  console.log(`✓ ${roleDefs.length} roles`);

  // -------- Employees + EmployeeRole + EmployeeAvailabilityRule --------
  let availabilityCount = 0;
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const e = EMPLOYEES[i];
    await prisma.employee.upsert({
      where: { id: e.id },
      update: {
        fullName: e.fullName,
        email: e.email,
        employmentType: e.employmentType,
        defaultLocationId: LOCATION_ID,
        defaultTimezone: TZ,
        isActive: true,
      },
      create: {
        id: e.id,
        organizationId: ORG_ID,
        fullName: e.fullName,
        email: e.email,
        employmentType: e.employmentType,
        defaultLocationId: LOCATION_ID,
        defaultTimezone: TZ,
        isActive: true,
      },
    });

    for (let r = 0; r < e.roles.length; r++) {
      const roleId = ROLE_IDS[e.roles[r]];
      await prisma.employeeRole.upsert({
        where: { id: employeeRoleUuid(i, r) },
        update: {
          skillLevel: r === 0 ? 3 : 2,
          isPrimary: r === 0,
        },
        create: {
          id: employeeRoleUuid(i, r),
          employeeId: e.id,
          roleId,
          skillLevel: r === 0 ? 3 : 2,
          isPrimary: r === 0,
        },
      });
    }

    for (let a = 0; a < e.availability.length; a++) {
      const rule = e.availability[a];
      await prisma.employeeAvailabilityRule.upsert({
        where: { id: availabilityUuid(i, a) },
        update: {
          dayOfWeek: rule.dayOfWeek,
          startLocalTime: rule.startLocalTime,
          endLocalTime: rule.endLocalTime,
          availabilityType: AvailabilityType.AVAILABLE,
          timezone: TZ,
        },
        create: {
          id: availabilityUuid(i, a),
          employeeId: e.id,
          dayOfWeek: rule.dayOfWeek,
          startLocalTime: rule.startLocalTime,
          endLocalTime: rule.endLocalTime,
          availabilityType: AvailabilityType.AVAILABLE,
          timezone: TZ,
        },
      });
      availabilityCount++;
    }
  }
  console.log(`✓ ${EMPLOYEES.length} employees`);
  console.log(`✓ ${availabilityCount} availability rules`);

  // -------- Schedule (current Sunday → Saturday in Asia/Jerusalem) --------
  // Luxon's `startOf('week')` is ISO Monday. We need Sunday — adjust.
  const nowTz = DateTime.now().setZone(TZ).startOf('day');
  const weekdayIso = nowTz.weekday; // 1=Mon..7=Sun
  const daysSinceSunday = weekdayIso === 7 ? 0 : weekdayIso;
  const weekStart = nowTz.minus({ days: daysSinceSunday });
  const weekEnd = weekStart.plus({ days: 6 });

  const weekStartJsDate = weekStart.toJSDate();
  const weekEndJsDate = weekEnd.toJSDate();

  await prisma.schedule.upsert({
    where: { id: SCHEDULE_ID },
    update: {
      name: `לוח שבועי — ${weekStart.toISODate() ?? 'unknown'}`,
      periodStartDate: weekStartJsDate,
      periodEndDate: weekEndJsDate,
      timezone: TZ,
      status: ScheduleStatus.DRAFT,
    },
    create: {
      id: SCHEDULE_ID,
      organizationId: ORG_ID,
      locationId: LOCATION_ID,
      name: `לוח שבועי — ${weekStart.toISODate() ?? 'unknown'}`,
      periodStartDate: weekStartJsDate,
      periodEndDate: weekEndJsDate,
      timezone: TZ,
      status: ScheduleStatus.DRAFT,
    },
  });

  // -------- Shifts + ShiftAssignment --------
  let shiftCount = 0;
  let assignmentCount = 0;
  let openShiftCount = 0;

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const day = weekStart.plus({ days: dayIdx });
    // Day 5 (Friday) and 6 (Saturday) are weekend — mark some open shifts.
    const isWeekend = dayIdx === 5 || dayIdx === 6;

    for (const slot of DAILY_SHIFTS) {
      const startLocal = day.set({
        hour: slot.startLocalHour,
        minute: slot.startLocalMinute,
        second: 0,
        millisecond: 0,
      });
      const endLocal = slot.crossesMidnight
        ? day.plus({ days: 1 }).set({
            hour: slot.endLocalHour,
            minute: slot.endLocalMinute,
            second: 0,
            millisecond: 0,
          })
        : day.set({
            hour: slot.endLocalHour,
            minute: slot.endLocalMinute,
            second: 0,
            millisecond: 0,
          });

      const shiftId = shiftUuid(dayIdx, slot.slotIndex);
      const roleId = ROLE_IDS[slot.roleKey];

      // Mark as open on weekend slots that we would otherwise assign — gives
      // the frontend visible blue "open shift" cards.
      const markOpen = isWeekend && (slot.slotIndex === 2 || slot.slotIndex === 0);
      if (markOpen) openShiftCount++;

      const assignThisShift = !markOpen && dayIdx % 2 === 0;

      await prisma.shift.upsert({
        where: { id: shiftId },
        update: {
          locationId: LOCATION_ID,
          roleId,
          scheduleId: SCHEDULE_ID,
          startAtUtc: startLocal.toUTC().toJSDate(),
          endAtUtc: endLocal.toUTC().toJSDate(),
          timezone: TZ,
          localStartDate: day.toJSDate(),
          localEndDate: slot.crossesMidnight
            ? day.plus({ days: 1 }).toJSDate()
            : day.toJSDate(),
          requiredEmployeeCount: slot.requiredCount,
          status: ShiftStatus.PLANNED,
          isOpenShift: markOpen,
        },
        create: {
          id: shiftId,
          organizationId: ORG_ID,
          locationId: LOCATION_ID,
          roleId,
          scheduleId: SCHEDULE_ID,
          startAtUtc: startLocal.toUTC().toJSDate(),
          endAtUtc: endLocal.toUTC().toJSDate(),
          timezone: TZ,
          localStartDate: day.toJSDate(),
          localEndDate: slot.crossesMidnight
            ? day.plus({ days: 1 }).toJSDate()
            : day.toJSDate(),
          requiredEmployeeCount: slot.requiredCount,
          status: ShiftStatus.PLANNED,
          isOpenShift: markOpen,
        },
      });
      shiftCount++;

      if (assignThisShift) {
        for (const empIdx of slot.assigneeIdxs) {
          const emp = EMPLOYEES[empIdx];
          await prisma.shiftAssignment.upsert({
            where: { id: assignmentUuid(dayIdx, slot.slotIndex, empIdx) },
            update: {
              assignmentStatus: AssignmentStatus.CONFIRMED,
              source: AssignmentSource.MANUAL,
              version: 1,
            },
            create: {
              id: assignmentUuid(dayIdx, slot.slotIndex, empIdx),
              shiftId,
              employeeId: emp.id,
              assignmentStatus: AssignmentStatus.CONFIRMED,
              source: AssignmentSource.MANUAL,
              version: 1,
            },
          });
          assignmentCount++;
        }
      }
    }
  }
  console.log(`✓ schedule + ${shiftCount} shifts (${openShiftCount} open)`);
  console.log(`✓ ${assignmentCount} assignments`);

  // -------- Per-employee metrics row (zeroed, so joins succeed) --------
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const emp = EMPLOYEES[i];
    await prisma.employeeScheduleMetrics.upsert({
      where: { id: metricsUuid(i) },
      update: {
        organizationId: ORG_ID,
        scheduleId: SCHEDULE_ID,
        employeeId: emp.id,
        weekStartDate: weekStartJsDate,
        totalScheduledMinutes: 0,
        totalPaidMinutes: 0,
        shiftCount: 0,
        consecutiveWorkDays: 0,
        weekendShiftCount: 0,
        nightShiftCount: 0,
        morningShiftCount: 0,
        eveningShiftCount: 0,
        fairnessScore: 0,
      },
      create: {
        id: metricsUuid(i),
        organizationId: ORG_ID,
        scheduleId: SCHEDULE_ID,
        employeeId: emp.id,
        weekStartDate: weekStartJsDate,
        totalScheduledMinutes: 0,
        totalPaidMinutes: 0,
        shiftCount: 0,
        consecutiveWorkDays: 0,
        weekendShiftCount: 0,
        nightShiftCount: 0,
        morningShiftCount: 0,
        eveningShiftCount: 0,
        fairnessScore: 0,
      },
    });
  }
  console.log(`✓ ${EMPLOYEES.length} metrics rows`);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Demo org seeded successfully');
  console.log('  Name:  מסעדת אלירן');
  console.log(`  Id:    ${ORG_ID}`);
  console.log(`  View:  https://sidor-eta.vercel.app/schedule?org=${ORG_ID}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
