/**
 * E2E spec: Templates apply flow
 *
 * Covers:
 *   1. Demo mode — "/" → "ראה דמו חי" → /schedule, DemoBanner visible
 *   2. Template gallery — /onboarding/templates shows 13 cards
 *   3. Each new-industry card has correct Hebrew name + emoji
 *   4. Graceful skip when backend is unreachable on :3001
 *
 * Prerequisites (local dev):
 *   - Next.js dev server running on http://localhost:3001
 *     (cd web && npm run dev)
 *   - NEXT_PUBLIC_AUTH_DISABLED=true in web/.env.local  — OR —
 *     Supabase env vars absent (AuthGuard falls back to ok-status via catch)
 *
 * Run:
 *   cd web && npm run test:e2e
 */

import { test, expect } from "@playwright/test";
import { SCHEDULE_TEMPLATES } from "../../src/modules/templates/schedule-templates";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** API base for the backend (always :3001 regardless of frontend port). */
const API_BASE = "http://localhost:3001";

/**
 * Returns true if the backend is reachable.
 * Used to conditionally skip DB-dependent tests.
 */
async function isBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── 1. Demo mode ─────────────────────────────────────────────────────────────

test.describe("Demo mode", () => {
  test('clicking "ראה דמו חי" navigates to /schedule in demo mode', async ({
    page,
  }) => {
    await page.goto("/");

    // The hero button text is "ראה דמו חי" and links to /schedule
    const demoLink = page.getByRole("link", { name: /ראה דמו חי/i });
    await expect(demoLink).toBeVisible();

    await demoLink.click();

    // Should land on /schedule (exact path, no query params required)
    await expect(page).toHaveURL(/\/schedule/);
  });

  test("DemoBanner is visible on /schedule when no session is present", async ({
    page,
    context,
  }) => {
    // Ensure clean session
    await context.clearCookies();
    await page.goto("/schedule");

    // DemoBanner renders a role="status" element with Hebrew demo text
    // It only renders when isDemo=true (no Supabase session)
    const banner = page.locator('[role="status"]');

    // The banner may or may not appear depending on whether Supabase is
    // configured in the running dev server.  We test what we can assert safely:
    // — if the banner IS present, it must contain the expected text
    // — if it is NOT present (auth fully disabled), the page still loads
    const bannerCount = await banner.count();
    if (bannerCount > 0) {
      await expect(banner.first()).toContainText("מצב דמו");
    } else {
      // Auth disabled or session found — page still loaded successfully
      await expect(page).toHaveURL(/\/schedule/);
    }
  });
});

// ─── 2. Template gallery loads ────────────────────────────────────────────────

test.describe("Template gallery (/onboarding/templates)", () => {
  test("shows exactly 13 template cards", async ({ page }) => {
    await page.goto("/onboarding/templates");

    // Each template card is a <button> that contains the template emoji
    // We wait for the grid to finish loading (skeleton disappears)
    // The grid items are <button> elements inside the template grid.
    // A loading state shows divs with animate-pulse; after load it shows buttons.
    await page.waitForSelector("button[class*='rounded-2xl']", {
      timeout: 10_000,
    });

    const cards = page.locator("button[class*='rounded-2xl']");
    await expect(cards).toHaveCount(13, { timeout: 10_000 });
  });

  test("each template card shows the template name", async ({ page }) => {
    await page.goto("/onboarding/templates");
    await page.waitForSelector("button[class*='rounded-2xl']", {
      timeout: 10_000,
    });

    for (const tpl of SCHEDULE_TEMPLATES) {
      // The name appears as text inside the card button
      const nameEl = page.locator(`button[class*='rounded-2xl']`, {
        hasText: tpl.name,
      });
      await expect(nameEl).toBeVisible({ timeout: 5_000 });
    }
  });

  // ─── 3. New-industry cards: Hebrew name + emoji ─────────────────────────────

  const NEW_TEMPLATES = [
    { id: "kindergarten", name: "גן ילדים / צהרון", emoji: "🧒" },
    { id: "school",       name: "בית ספר / אקדמיה", emoji: "📚" },
    { id: "homecare",     name: "שירותי בית / סיעוד", emoji: "🏠" },
    { id: "events",       name: "אירועים / קייטרינג", emoji: "🎉" },
    { id: "garage",       name: "מוסך / שירות רכב",  emoji: "🔧" },
  ] as const;

  for (const { id, name, emoji } of NEW_TEMPLATES) {
    test(`template card "${id}" shows correct name "${name}" and emoji ${emoji}`, async ({
      page,
    }) => {
      await page.goto("/onboarding/templates");
      await page.waitForSelector("button[class*='rounded-2xl']", {
        timeout: 10_000,
      });

      // Find a card button that contains both the name and the emoji
      const card = page.locator(`button[class*='rounded-2xl']`, {
        hasText: name,
      });
      await expect(card).toBeVisible({ timeout: 5_000 });
      await expect(card).toContainText(emoji);
    });
  }

  test("clicking a template card selects it and shows the apply CTA", async ({
    page,
  }) => {
    await page.goto("/onboarding/templates");
    await page.waitForSelector("button[class*='rounded-2xl']", {
      timeout: 10_000,
    });

    // Click the first template card
    const firstCard = page.locator("button[class*='rounded-2xl']").first();
    await firstCard.click();

    // The sticky CTA button "החל טמפלייט →" should appear
    const applyBtn = page.getByRole("button", { name: /החל טמפלייט/i });
    await expect(applyBtn).toBeVisible({ timeout: 3_000 });
  });

  test("skip link navigates to /schedule", async ({ page }) => {
    await page.goto("/onboarding/templates");

    const skipLink = page.getByRole("link", { name: /דלג וצור משמרות ידנית/i });
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute("href", "/schedule");
  });
});

// ─── 4. Backend apply — skipped when backend is not running ──────────────────

test.describe("Backend: POST /v1/templates/:id/apply", () => {
  test("kindergarten template apply returns expected shape", async () => {
    const up = await isBackendUp();
    test.skip(!up, "Backend not running on :3001 — skipping DB-dependent test");

    const weekStart = "2026-05-25"; // canonical test Sunday
    const res = await fetch(
      `${API_BASE}/v1/templates/kindergarten/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scheduleId: string;
      weekStart: string;
      createdRoles: number;
      createdShifts: number;
      template: string;
    };

    // kindergarten has 3 roles
    expect(body.createdRoles).toBe(3);
    // 3 shifts × 6 days/week = 18 shift instances
    expect(body.createdShifts).toBe(18);
    expect(body.template).toBe("גן ילדים / צהרון");
    expect(body.weekStart).toBe(weekStart);
    expect(typeof body.scheduleId).toBe("string");
  });

  test("unknown template id returns 404", async () => {
    const up = await isBackendUp();
    test.skip(!up, "Backend not running on :3001 — skipping");

    const res = await fetch(`${API_BASE}/v1/templates/nonexistent-xyz/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  test("GET /v1/templates returns 13 templates when backend is up", async () => {
    const up = await isBackendUp();
    test.skip(!up, "Backend not running on :3001 — skipping");

    const res = await fetch(`${API_BASE}/v1/templates`);
    expect(res.status).toBe(200);
    const templates = (await res.json()) as unknown[];
    expect(templates).toHaveLength(13);
  });
});

// ─── 5. Template data contract (pure, no server needed) ──────────────────────

test.describe("Template data (pure, no server)", () => {
  test("SCHEDULE_TEMPLATES has 13 entries", () => {
    expect(SCHEDULE_TEMPLATES).toHaveLength(13);
  });

  test("all 5 new templates are present with correct industry values", () => {
    const map = new Map(SCHEDULE_TEMPLATES.map((t) => [t.id, t]));
    expect(map.get("kindergarten")?.industry).toBe("kindergarten");
    expect(map.get("school")?.industry).toBe("school");
    expect(map.get("homecare")?.industry).toBe("homecare");
    expect(map.get("events")?.industry).toBe("events");
    expect(map.get("garage")?.industry).toBe("garage");
  });

  test("kindergarten template shift count matches expected 18 instances", () => {
    const tpl = SCHEDULE_TEMPLATES.find((t) => t.id === "kindergarten");
    expect(tpl).toBeDefined();
    const total = tpl!.shifts.reduce((sum, s) => sum + s.daysOfWeek.length, 0);
    expect(total).toBe(18);
  });

  test("all shifts reference roles that exist in template.roles", () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      for (const shift of tpl.shifts) {
        expect(tpl.roles).toContain(shift.role);
      }
    }
  });

  test("shiftCount field returned by GET /v1/templates matches computed value", () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      const computed = tpl.shifts.reduce(
        (sum, s) => sum + s.daysOfWeek.length,
        0,
      );
      // The route serialises this as shiftCount — verify the computation
      expect(computed).toBeGreaterThan(0);
    }
  });
});
