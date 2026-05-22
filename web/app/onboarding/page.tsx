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
import { getSupabase } from "@/lib/supabase";
import { createOrg } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2, "שם הארגון חייב להיות לפחות 2 תווים"),
  defaultLocationName: z.string().min(1).optional(),
  industry: z.enum(["restaurant", "retail", "other"]),
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
      industry: "restaurant",
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>בוא נכין את העסק שלך</CardTitle>
          <CardDescription>
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
                placeholder="לדוגמה: מסעדת אלירן"
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
                <option value="retail">קמעונאות / חנות</option>
                <option value="other">אחר</option>
              </select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "יוצר ארגון…" : "צור ארגון והיכנס ללוח"}
            </Button>
          </form>
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
