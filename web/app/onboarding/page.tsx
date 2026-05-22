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
import { createOrg } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2, "שם הארגון חייב להיות לפחות 2 תווים"),
  defaultLocationName: z.string().min(1).optional(),
  industry: z.enum(["restaurant", "retail", "pharmacy", "other"]),
});

type FormData = z.infer<typeof schema>;

function OnboardingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      defaultLocationName: "ראשי",
      industry: "other",
    },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      await createOrg({
        name: data.name,
        defaultLocationName: data.defaultLocationName,
        industry: data.industry,
        defaultTimezone: "Asia/Jerusalem",
      });
      // Refresh the JWT so the new organization_id claim arrives.
      try {
        const supabase = getSupabase();
        await supabase.auth.refreshSession();
      } catch {
        // ignored — backend already scopes by the new org id via DB lookup.
      }
      toast.success("הארגון נוצר! נכנסים ללוח המשמרות…");
      router.replace("/schedule");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "יצירת הארגון נכשלה";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex justify-center">
            <Logo size={36} />
          </div>
          {/* 3-dot progress */}
          <div className="flex gap-2 mb-8 justify-center" aria-label="שלב 1 מתוך 3">
            {[0,1,2].map(i => (
              <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === 0 ? 'bg-[#6366F1]' : 'bg-muted'}`} />
            ))}
          </div>
          <CardTitle className="text-center">בוא נכין את העסק שלך</CardTitle>
          <CardDescription className="text-center">
            ניצור לך ארגון חדש, סניף ראשי וסידור ריק לשבוע הקרוב — דקה אחת.
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
                placeholder="לדוגמה: העסק שלי"
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
              <Label htmlFor="defaultLocationName">שם הסניף הראשי</Label>
              <Input
                id="defaultLocationName"
                type="text"
                placeholder="ראשי"
                {...form.register("defaultLocationName")}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="industry">תחום</Label>
              <select
                id="industry"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                {...form.register("industry")}
              >
                <option value="restaurant">מסעדה / קפה</option>
                <option value="retail">קמעונאות / חנות בגדים</option>
                <option value="pharmacy">פארם / בית מרקחת</option>
                <option value="other">אחר</option>
              </select>
            </div>

            <Button
              type="submit"
              variant="glow"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? "יוצר ארגון…" : "צור ארגון והיכנס ללוח"}
            </Button>
          </form>

          <div className="mt-4 border-t border-border pt-4 text-center">
            <a
              href="/onboarding/templates"
              className="text-sm text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
            >
              בחר מתוך טמפלייטים מוכנים לפי סוג העסק ↗
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard skipMembershipCheck>
      <OnboardingForm />
    </AuthGuard>
  );
}
