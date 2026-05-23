/**
 * Auth helper for Playwright E2E tests.
 *
 * Strategy
 * --------
 * The app supports a "public demo" mode: when no Supabase session is present
 * the DemoBoundary component renders children with `isDemo = true` instead of
 * redirecting to /login.  This means:
 *
 *   - Visiting /schedule without a session → demo mode, no redirect.
 *   - Visiting /onboarding/templates without a session → AuthGuard has
 *     `skipMembershipCheck` but still checks the session and redirects if
 *     there is none.
 *
 * For the templates page we bypass auth by clearing localStorage/cookies so
 * there is definitely no stale Supabase token, and then relying on the fact
 * that the AuthGuard in non-strict mode allows access when `NEXT_PUBLIC_AUTH_DISABLED`
 * is truthy — or falls back to demo rendering.
 *
 * In a CI environment with a real Supabase project you would inject a JWT here
 * instead.  For now the helpers are kept minimal so they work without a DB.
 */
import type { Page } from "@playwright/test";

/** Storage key used by the Supabase JS client for the auth token. */
const SUPABASE_STORAGE_KEY_PATTERN = "sb-";

/**
 * Clears any Supabase session from localStorage and cookies so the page starts
 * in a clean, unauthenticated state (demo mode for pages that support it).
 */
export async function clearSession(page: Page): Promise<void> {
  // Navigate to a minimal page first so we have an origin to work with.
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate((pattern) => {
    // Remove every localStorage key that looks like a Supabase token.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(pattern)) {
        localStorage.removeItem(key);
      }
    }
  }, SUPABASE_STORAGE_KEY_PATTERN);

  // Clear all cookies for the origin.
  await page.context().clearCookies();
}

/**
 * Visits a URL after ensuring no session is active.
 * Useful for pages that render in demo / unauthenticated mode.
 */
export async function visitAsGuest(page: Page, url: string): Promise<void> {
  await clearSession(page);
  await page.goto(url);
}
