import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDayPart,
  timeToMinutes,
  toWeeklyTemplatePayload,
  toEmployeePrefUpdates,
  fromWeeklyTemplate,
  presetDayParts,
  DEFAULT_TEMPLATE_NAME,
  type RulesState,
} from "./rules-mapping";

const baseState: RulesState = {
  activeDays: [0, 1, 2], // Sun, Mon, Tue
  dayParts: [
    { id: "m", name: "בוקר", start: "09:00", end: "15:00", headcount: 2 },
    { id: "e", name: "ערב", start: "17:00", end: "23:00", headcount: 3 },
  ],
  fixed: [
    { employeeId: "avi", dayPartId: "m", days: [0, 1, 2] }, // Avi mornings
    { employeeId: "moti", dayPartId: "e", days: [0, 1] }, // Moti evenings (2 days)
  ],
};

test("timeToMinutes parses HH:MM", () => {
  assert.equal(timeToMinutes("09:00"), 540);
  assert.equal(timeToMinutes("17:30"), 1050);
  assert.equal(timeToMinutes("0:00"), 0);
});

test("classifyDayPart thresholds", () => {
  assert.equal(classifyDayPart("09:00"), "morning");
  assert.equal(classifyDayPart("13:59"), "morning");
  assert.equal(classifyDayPart("15:00"), "other");
  assert.equal(classifyDayPart("16:00"), "evening");
  assert.equal(classifyDayPart("23:00"), "evening");
});

test("toWeeklyTemplatePayload: one shift per active day x day-part", () => {
  const p = toWeeklyTemplatePayload(baseState, { timezone: "Asia/Jerusalem" });
  assert.equal(p.name, DEFAULT_TEMPLATE_NAME);
  assert.equal(p.shifts.length, 3 * 2); // 3 days * 2 parts
  for (const s of p.shifts) {
    assert.equal(s.timezone, "Asia/Jerusalem");
    assert.ok((s.requiredEmployeeCount ?? 0) >= 1);
  }
});

test("toWeeklyTemplatePayload: headcount mapped per part", () => {
  const p = toWeeklyTemplatePayload(baseState);
  const morning = p.shifts.filter((s) => s.startLocalTime === "09:00");
  const evening = p.shifts.filter((s) => s.startLocalTime === "17:00");
  assert.ok(morning.every((s) => s.requiredEmployeeCount === 2));
  assert.ok(evening.every((s) => s.requiredEmployeeCount === 3));
});

test("toWeeklyTemplatePayload: fixed -> defaultEmployeeIds on matching shifts only", () => {
  const p = toWeeklyTemplatePayload(baseState);
  // Avi on every morning (all 3 days)
  const aviShifts = p.shifts.filter((s) => s.defaultEmployeeIds?.includes("avi"));
  assert.equal(aviShifts.length, 3);
  assert.ok(aviShifts.every((s) => s.startLocalTime === "09:00"));
  // Moti only on 2 evenings (days 0,1)
  const motiShifts = p.shifts.filter((s) => s.defaultEmployeeIds?.includes("moti"));
  assert.equal(motiShifts.length, 2);
  assert.ok(motiShifts.every((s) => s.startLocalTime === "17:00" && s.dayOfWeek !== 2));
});

test("perDayHeadcount override wins", () => {
  const s: RulesState = { ...baseState, perDayHeadcount: { 0: { m: 5 } } };
  const p = toWeeklyTemplatePayload(s);
  const sun = p.shifts.find((x) => x.dayOfWeek === 0 && x.startLocalTime === "09:00")!;
  const mon = p.shifts.find((x) => x.dayOfWeek === 1 && x.startLocalTime === "09:00")!;
  assert.equal(sun.requiredEmployeeCount, 5);
  assert.equal(mon.requiredEmployeeCount, 2);
});

test("toEmployeePrefUpdates: morning/evening flags", () => {
  const ups = toEmployeePrefUpdates(baseState);
  const avi = ups.find((u) => u.employeeId === "avi")!;
  const moti = ups.find((u) => u.employeeId === "moti")!;
  assert.deepEqual(avi, { employeeId: "avi", prefersMornings: true, prefersEvenings: false });
  assert.deepEqual(moti, { employeeId: "moti", prefersMornings: false, prefersEvenings: true });
});

test("round-trip: fromWeeklyTemplate recovers windows, headcounts, days, fixed", () => {
  const payload = toWeeklyTemplatePayload(baseState);
  // simulate backend read (payload shifts already match the read shape)
  const recovered = fromWeeklyTemplate({
    name: payload.name,
    shifts: payload.shifts.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startLocalTime: s.startLocalTime,
      endLocalTime: s.endLocalTime,
      requiredEmployeeCount: s.requiredEmployeeCount ?? 1,
      defaultEmployeeIds: s.defaultEmployeeIds ?? [],
    })),
  });

  assert.deepEqual(recovered.activeDays, [0, 1, 2]);
  // 2 day-parts recovered by window
  assert.equal(recovered.dayParts.length, 2);
  const windows = recovered.dayParts.map((d) => `${d.start}-${d.end}`).sort();
  assert.deepEqual(windows, ["09:00-15:00", "17:00-23:00"]);
  // headcounts preserved
  const m = recovered.dayParts.find((d) => d.start === "09:00")!;
  const e = recovered.dayParts.find((d) => d.start === "17:00")!;
  assert.equal(m.headcount, 2);
  assert.equal(e.headcount, 3);
  // fixed recovered
  const avi = recovered.fixed.find((f) => f.employeeId === "avi")!;
  assert.equal(avi.dayPartId, m.id);
  assert.deepEqual(avi.days, [0, 1, 2]);
  const moti = recovered.fixed.find((f) => f.employeeId === "moti")!;
  assert.equal(moti.dayPartId, e.id);
  assert.deepEqual(moti.days, [0, 1]);
});

test("round-trip: per-day headcount override survives", () => {
  const s: RulesState = { ...baseState, perDayHeadcount: { 0: { m: 5 } } };
  const payload = toWeeklyTemplatePayload(s);
  const recovered = fromWeeklyTemplate({
    name: payload.name,
    shifts: payload.shifts.map((x) => ({
      dayOfWeek: x.dayOfWeek,
      startLocalTime: x.startLocalTime,
      endLocalTime: x.endLocalTime,
      requiredEmployeeCount: x.requiredEmployeeCount ?? 1,
      defaultEmployeeIds: x.defaultEmployeeIds ?? [],
    })),
  });
  const m = recovered.dayParts.find((d) => d.start === "09:00")!;
  // baseline stays 2 (modal), day 0 overridden to 5
  assert.equal(m.headcount, 2);
  assert.equal(recovered.perDayHeadcount?.[0]?.[m.id], 5);
});

test("presetDayParts: restaurant vs generic", () => {
  const rest = presetDayParts("מסעדה");
  assert.equal(rest.length, 2);
  assert.equal(rest[0]!.name, "בוקר");
  const generic = presetDayParts("retail");
  assert.equal(generic.length, 1);
});
