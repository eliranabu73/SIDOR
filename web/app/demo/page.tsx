import { redirect } from "next/navigation";

/**
 * /demo — redirects to the live scheduler demo so external links and CTAs
 * that point to this URL don't land on a 404.
 * The schedule page uses AUTH_DISABLED / DemoBoundary to work without login.
 */
export default function DemoPage() {
  redirect("/schedule");
}
