import { DateTime } from "luxon";
import type {
  Employee,
  EmployeeScheduleMetrics,
  Location,
  Organization,
  Schedule,
  Shift,
} from "./types";

const ORG_ID = "org_demo";

export const mockOrg: Organization = {
  id: ORG_ID,
  name: "סידור4S · ארגון הדגמה",
  timezone: "Asia/Jerusalem",
};

export const mockLocations: Location[] = [
  { id: "loc_1", orgId: ORG_ID, name: "סניף תל אביב" },
  { id: "loc_2", orgId: ORG_ID, name: "סניף חיפה" },
];

export const mockEmployees: Employee[] = [
  {
    id: "emp_1",
    orgId: ORG_ID,
    fullName: "דנה כהן",
    email: "dana@example.com",
    roles: ["מלצרית", "ברמנית"],
    primaryLocationId: "loc_1",
    active: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
  },
  {
    id: "emp_2",
    orgId: ORG_ID,
    fullName: "יוסי לוי",
    email: "yossi@example.com",
    roles: ["מנהל משמרת"],
    primaryLocationId: "loc_1",
    active: true,
    maxHoursPerWeek: 45,
    minHoursPerWeek: 30,
  },
  {
    id: "emp_3",
    orgId: ORG_ID,
    fullName: "מאיה בן-דוד",
    email: "maya@example.com",
    roles: ["מלצרית"],
    primaryLocationId: "loc_2",
    active: true,
    maxHoursPerWeek: 30,
    minHoursPerWeek: 15,
  },
  {
    id: "emp_4",
    orgId: ORG_ID,
    fullName: "אורי שמש",
    email: "uri@example.com",
    roles: ["טבח"],
    primaryLocationId: "loc_1",
    active: true,
    maxHoursPerWeek: 50,
    minHoursPerWeek: 35,
  },
  {
    id: "emp_5",
    orgId: ORG_ID,
    fullName: "תמר רוזן",
    email: "tamar@example.com",
    roles: ["ברמנית", "מלצרית"],
    primaryLocationId: "loc_2",
    active: true,
    maxHoursPerWeek: 25,
    minHoursPerWeek: 10,
  },
];

export const mockMetrics: EmployeeScheduleMetrics[] = mockEmployees.map(
  (e, i) => ({
    employeeId: e.id,
    weeklyAssignedMinutes: (8 + i * 3) * 60,
    weeklyTargetMinutes: (e.maxHoursPerWeek ?? 40) * 60,
    fairnessScore: 0.4 + (i % 5) * 0.12,
  }),
);

function startOfWeek(d: DateTime): DateTime {
  // Sunday-start
  const weekday = d.weekday % 7; // Monday=1 .. Sunday=7 -> 0
  return d.startOf("day").minus({ days: weekday });
}

function makeShift(
  id: string,
  scheduleId: string,
  locationId: string,
  role: string,
  startsAt: DateTime,
  hours: number,
  required: number,
  assigneeIds: string[],
): Shift {
  return {
    id,
    scheduleId,
    locationId,
    role,
    startsAt: startsAt.toISO() ?? "",
    endsAt: startsAt.plus({ hours }).toISO() ?? "",
    requiredCount: required,
    version: 1,
    assignments: assigneeIds.map((employeeId, idx) => ({
      id: `${id}_a${idx}`,
      shiftId: id,
      employeeId,
      status: "assigned" as const,
      createdAt: startsAt.toISO() ?? "",
    })),
  };
}

export function buildMockSchedule(weekStart?: DateTime): Schedule {
  const base = startOfWeek(weekStart ?? DateTime.now().setZone(mockOrg.timezone));
  const scheduleId = `sched_${base.toISODate()}`;
  const shifts: Shift[] = [];
  const roles = [
    { role: "מלצרית", count: 2, hours: 6 },
    { role: "ברמנית", count: 1, hours: 7 },
    { role: "טבח", count: 1, hours: 8 },
    { role: "מנהל משמרת", count: 1, hours: 9 },
  ];
  for (let day = 0; day < 7; day++) {
    const dayStart = base.plus({ days: day });
    let idx = 0;
    for (const r of roles) {
      for (const startHour of [9, 17]) {
        const sid = `shift_${day}_${idx++}`;
        const startsAt = dayStart.set({ hour: startHour });
        const assignees = day < 3 && startHour === 9 ? [mockEmployees[idx % mockEmployees.length]!.id] : [];
        shifts.push(
          makeShift(
            sid,
            scheduleId,
            mockLocations[day % mockLocations.length]!.id,
            r.role,
            startsAt,
            r.hours,
            r.count,
            assignees,
          ),
        );
      }
    }
  }
  return {
    id: scheduleId,
    orgId: ORG_ID,
    weekStart: base.toISO() ?? "",
    status: "draft",
    shifts,
  };
}
