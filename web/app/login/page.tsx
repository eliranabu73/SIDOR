"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("כתובת דוא״ל לא תקינה"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [sent, setSent] = React.useState<string | null>(null);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async ({ email }: FormData) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/schedule`
              : undefined,
        },
      });
      if (error) throw error;
      setSent(email);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחת הקישור נכשלה");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            ברוכים הבאים ל-סידור<span className="text-primary">4S</span>
          </CardTitle>
          <CardDescription>
            התחבר/י עם כתובת הדוא״ל וקבל/י קישור התחברות.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-sm space-y-2" role="status" aria-live="polite">
              <div className="font-medium">קישור נשלח אל {sent}</div>
              <p className="text-muted-foreground">
                בדוק את תיבת הדואר הנכנס ולחץ על הקישור כדי להתחבר.
              </p>
              <Button variant="link" onClick={() => setSent(null)} className="p-0">
                שלח שוב
              </Button>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1">
                <Label htmlFor="email">דוא״ל</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  {...form.register("email")}
                  aria-invalid={!!form.formState.errors.email}
                />
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive" role="alert">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                <Mail className="h-4 w-4" />
                {form.formState.isSubmitting ? "שולח…" : "שלח קישור התחברות"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
