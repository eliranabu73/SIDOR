import { test, expect, type Route } from "@playwright/test";

// Block the PWA service worker — in dev it can serve a cached navigation shell
// for client-routed pages, which makes route assertions flaky.
test.use({ serviceWorkers: "block" });

/**
 * End-to-end UI test for the "schedule rules" wizard.
 *
 * Runs against the local dev server with NEXT_PUBLIC_AUTH_DISABLED=true (so the
 * AuthGuard renders the page without a Supabase session). EVERY /v1/* call is
 * stubbed via page.route, so no backend / DB is needed and nothing can leak to a
 * real API. We then drive the wizard like a user and assert the exact payload it
 * POSTs — proving the React state → mapping → network contract works for real.
 */

const SETTINGS = {
  id: "org1",
  name: "מסעדת בדיקה",
  industry: "מסעדה",
  defaultTimezone: "Asia/Jerusalem",
  weekStartDay: 0,
  plan: "free",
  logoUrl: null,
  laborRules: { activeDaysOfWeek: [0, 1, 2], businessHoursStart: "09:00" },
  roles: [],
  locations: [{ id: "loc1", name: "סניף ראשי", timezone: null, address: null }],
};

const EMPLOYEES = [
  { id: "avi", orgId: "org1", fullName: "אבי", email: null, roles: [], primaryLocationId: null, active: true, hourlyRate: 0 },
  { id: "moti", orgId: "org1", fullName: "מוטי", email: null, roles: [], primaryLocationId: null, active: true, hourlyRate: 0 },
];

const ME = {
  user: { id: "u1", role: "OWNER" },
  memberships: [{ orgId: "org1", orgName: "מסעדת בדיקה", role: "OWNER" }],
  activeOrgId: "org1",
};

type Captured = { weeklyTemplate?: any; prefs: Record<string, any> };

async function installStubs(page: import("@playwright/test").Page, captured: Captured) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    // --- writes we assert on ---
    if (path.endsWith("/v1/weekly-templates") && method === "POST") {
      captured.weeklyTemplate = JSON.parse(req.postData() ?? "{}");
      return json(route, { id: "wt1", organizationId: "org1", locationId: null, name: captured.weeklyTemplate.name, isActive: true, shifts: [] }, 201);
    }
    if (/\/v1\/weekly-templates\/[^/]+$/.test(path) && method === "PUT") {
      captured.weeklyTemplate = JSON.parse(req.postData() ?? "{}");
      return json(route, { id: "wt1", organizationId: "org1", locationId: null, name: captured.weeklyTemplate.name, isActive: true, shifts: [] });
    }
    if (/\/v1\/employees\/([^/]+)\/preferences$/.test(path) && method === "PUT") {
      const empId = path.match(/\/v1\/employees\/([^/]+)\/preferences$/)![1]!;
      captured.prefs[empId] = JSON.parse(req.postData() ?? "{}");
      return json(route, captured.prefs[empId]);
    }

    // --- reads ---
    if (/\/v1\/employees\/([^/]+)\/preferences$/.test(path)) return json(route, null);
    if (path.endsWith("/v1/weekly-templates")) return json(route, []);
    if (path.endsWith("/v1/settings")) return json(route, SETTINGS);
    if (path.endsWith("/v1/employees") || path.endsWith("/v1/employees/summary")) return json(route, EMPLOYEES);
    if (path.endsWith("/v1/me")) return json(route, ME);
    if (path.endsWith("/v1/roles")) return json(route, []);

    // catch-all: never let a real call escape to a backend.
    return json(route, []);
  });
}

test("rules wizard saves correct weekly-template + preferences payload", async ({ page }) => {
  const captured: Captured = { prefs: {} };
  await installStubs(page, captured);

  await page.goto("/settings?tab=rules");

  // Wizard loaded → restaurant presets visible (בוקר / ערב day-parts).
  await expect(page.getByText("חלקי היום וכמה אנשים")).toBeVisible({ timeout: 15000 });
  const nameInputs = page.locator('input[id^="name-"]');
  await expect(nameInputs).toHaveCount(2);
  await expect(nameInputs.nth(0)).toHaveValue("בוקר");
  await expect(nameInputs.nth(1)).toHaveValue("ערב");

  // Add a fixed person (defaults: first employee = אבי, first day-part = בוקר, all days on).
  await page.getByRole("button", { name: "הוסף אדם קבוע" }).click();
  await expect(page.getByLabel("בחר עובד")).toBeVisible();

  // Save.
  await page.getByRole("button", { name: "שמור כללים" }).click();

  // Network payload captured.
  await expect.poll(() => captured.weeklyTemplate?.shifts?.length, { timeout: 10000 }).toBe(6); // 3 days × 2 parts

  const wt = captured.weeklyTemplate;
  expect(wt.name).toBe("ברירת מחדל");

  const mornings = wt.shifts.filter((s: any) => s.startLocalTime === "09:00");
  const evenings = wt.shifts.filter((s: any) => s.startLocalTime === "17:00");
  expect(mornings).toHaveLength(3);
  expect(evenings).toHaveLength(3);
  // headcount from restaurant preset = 2 each.
  expect(mornings.every((s: any) => s.requiredEmployeeCount === 2)).toBe(true);

  // אבי fixed to all 3 morning shifts (defaultEmployeeIds).
  const aviMornings = mornings.filter((s: any) => (s.defaultEmployeeIds ?? []).includes("avi"));
  expect(aviMornings).toHaveLength(3);
  // not on evenings.
  expect(evenings.some((s: any) => (s.defaultEmployeeIds ?? []).includes("avi"))).toBe(false);

  // soft preference written: prefersMornings true for אבי.
  await expect.poll(() => captured.prefs["avi"]?.prefersMornings, { timeout: 10000 }).toBe(true);
});

test("onboarding rules step saves and advances to review", async ({ page }) => {
  const captured: Captured = { prefs: {} };
  await installStubs(page, captured);

  await page.goto("/onboarding/setup/shifts");
  await expect(page.getByRole("heading", { name: "כללי הסידור" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("חלקי היום וכמה אנשים")).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "שמור והמשך לסקירה" }).click();

  // Weekly template saved (6 shifts: 3 active days × 2 parts) AND navigated on.
  await expect.poll(() => captured.weeklyTemplate?.shifts?.length, { timeout: 10000 }).toBe(6);
  await expect(page).toHaveURL(/\/onboarding\/setup\/review$/, { timeout: 10000 });
});

test("wizard pre-fills (reverse-maps) an existing canonical template", async ({ page }) => {
  const captured: Captured = { prefs: {} };

  const existing = {
    id: "wt1",
    organizationId: "org1",
    locationId: null,
    name: "ברירת מחדל",
    isActive: true,
    shifts: [
      // morning across 2 days, אבי fixed
      { id: "s1", dayOfWeek: 0, startLocalTime: "09:00", endLocalTime: "15:00", timezone: "Asia/Jerusalem", roleId: null, requiredEmployeeCount: 2, defaultEmployeeIds: ["avi"] },
      { id: "s2", dayOfWeek: 1, startLocalTime: "09:00", endLocalTime: "15:00", timezone: "Asia/Jerusalem", roleId: null, requiredEmployeeCount: 2, defaultEmployeeIds: ["avi"] },
      // evening across 2 days
      { id: "s3", dayOfWeek: 0, startLocalTime: "17:00", endLocalTime: "23:00", timezone: "Asia/Jerusalem", roleId: null, requiredEmployeeCount: 3, defaultEmployeeIds: [] },
      { id: "s4", dayOfWeek: 1, startLocalTime: "17:00", endLocalTime: "23:00", timezone: "Asia/Jerusalem", roleId: null, requiredEmployeeCount: 3, defaultEmployeeIds: [] },
    ],
  };

  // Same stubs but weekly-templates GET returns the existing template.
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (/\/v1\/weekly-templates\/[^/]+$/.test(path) && method === "PUT") {
      captured.weeklyTemplate = JSON.parse(req.postData() ?? "{}");
      return json(route, existing);
    }
    if (/\/v1\/employees\/([^/]+)\/preferences$/.test(path) && method === "PUT") {
      const empId = path.match(/\/v1\/employees\/([^/]+)\/preferences$/)![1]!;
      captured.prefs[empId] = JSON.parse(req.postData() ?? "{}");
      return json(route, captured.prefs[empId]);
    }
    if (/\/v1\/employees\/([^/]+)\/preferences$/.test(path)) return json(route, null);
    if (path.endsWith("/v1/weekly-templates")) return json(route, [existing]);
    if (path.endsWith("/v1/settings")) return json(route, SETTINGS);
    if (path.endsWith("/v1/employees") || path.endsWith("/v1/employees/summary")) return json(route, EMPLOYEES);
    if (path.endsWith("/v1/me")) return json(route, ME);
    return json(route, []);
  });

  await page.goto("/settings?tab=rules");
  await expect(page.getByText("חלקי היום וכמה אנשים")).toBeVisible({ timeout: 15000 });

  // Two day-parts recovered by window, names regenerated to בוקר / ערב.
  const nameInputs = page.locator('input[id^="name-"]');
  await expect(nameInputs).toHaveCount(2);
  await expect(nameInputs.nth(0)).toHaveValue("בוקר");
  await expect(nameInputs.nth(1)).toHaveValue("ערב");

  // Fixed-person row for אבי recovered from defaultEmployeeIds.
  await expect(page.getByLabel("בחר עובד")).toHaveValue("avi");

  // Re-save issues a PUT (update), not POST (create).
  await page.getByRole("button", { name: "שמור כללים" }).click();
  await expect.poll(() => captured.weeklyTemplate?.shifts?.length, { timeout: 10000 }).toBe(4);
});
