"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/brand/Logo";
import { getSupabase } from "@/lib/supabase";
import { ApiError } from "@/lib/api";
import { INDUSTRY_OPTIONS } from "@/lib/industries";

const schema = z.object({
  name: z.string().min(2, "שם הארגון חייב להיות לפחות 2 תווים"),
  industry: z.string().min(1).max(40),
  employeeCount: z
    .number({ message: "צריך להזין מספר" })
    .int("מספר שלם בלבד")
    .min(1, "לפחות עובד אחד")
    .max(200, "עד 200 עובדים"),
});

type FormData = z.infer<typeof schema>;

interface QuickBootstrapResult {
  organizationId: string;
  scheduleId: string;
}

async function postQuickBootstrap(payload: FormData): Promise<QuickBootstrapResult> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (data.session?.access_token) {
    headers["authorization"] = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${apiUrl}/v1/onboarding/quick-bootstrap`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as QuickBootstrapResult;
}

function OnboardingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      industry: "restaurant",
      employeeCount: 5,
    },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const result = await postQuickBootstrap(data);
      // Refresh JWT so the new organization_id claim arrives.
      try {
        const supabase = getSupabase();
        await supabase.auth.refreshSession();
      } catch {
        // ignored — backend already scopes by the new org id via DB lookup.
      }
      router.replace(`/onboarding/quick-schedule?org=${encodeURIComponent(result.organizationId)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "יצירת הארגון נכשלה";
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <main className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <h1 className="sr-only">הגדרת ארגון — סידור4S</h1>
      <Card className="glass-card w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex justify-center">
            <Logo size={36} />
          </div>
          <CardTitle className="text-center">60 שניות לסידור הראשון שלך</CardTitle>
          <CardDescription className="text-center">
            ניצור ארגון, סניף, עובדים ראשונים וסידור שבועי מלא — מוכן לעריכה תוך שניות.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1">
              <Label htmlFor="name">שם העסק</Label>
              <Input
                id="name"
                type="text"
                placeholder="לדוגמה: קפה הבוקר"
                aria-invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="industry">תחום</Label>
              <select
                id="industry"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                {...form.register("industry")}
              >
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="employeeCount">מספר עובדים משוער</Label>
              <Input
                id="employeeCount"
                type="number"
                min={1}
                max={200}
                inputMode="numeric"
                aria-invalid={!!form.formState.errors.employeeCount}
                {...form.register("employeeCount", { valueAsNumber: true })}
              />
              {form.formState.errors.employeeCount && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.employeeCount.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="glow"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? "בונה את הסידור שלך…" : "בנה לי סידור עכשיו"}
            </Button>
          </form>

          <div className="mt-4 border-t border-border pt-4 text-center">
            <a
              href="/onboarding/templates"
              className="text-sm text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
            >
              העדפה לבחור תבנית ידנית? ↗
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard skipMembershipCheck>
      <OnboardingForm />
    </AuthGuard>
  );
}
