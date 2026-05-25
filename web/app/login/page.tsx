"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/brand/Logo";
import { getSupabase } from "@/lib/supabase";
import { translateAuthError, passwordStrength } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";

// --- Schemas ---

const signInSchema = z.object({
  email: z.string().email("כתובת דוא״ל לא תקינה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});
type SignInData = z.infer<typeof signInSchema>;

const signUpSchema = z.object({
  fullName: z.string().min(2, "יש להזין שם מלא"),
  email: z.string().email("כתובת דוא״ל לא תקינה"),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});
type SignUpData = z.infer<typeof signUpSchema>;

const magicSchema = z.object({
  email: z.string().email("כתובת דוא״ל לא תקינה"),
});
type MagicData = z.infer<typeof magicSchema>;

// --- Google "G" icon ---

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.95h5.5c-.24 1.42-1.7 4.16-5.5 4.16-3.31 0-6.02-2.74-6.02-6.13S8.69 6.05 12 6.05c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.84 3.5 14.66 2.5 12 2.5 6.85 2.5 2.7 6.65 2.7 11.8s4.15 9.3 9.3 9.3c5.37 0 8.92-3.77 8.92-9.08 0-.61-.07-1.08-.15-1.55H12z"
      />
      <path
        fill="#34A853"
        d="M3.88 7.36l3.24 2.38C8 7.95 9.85 6.05 12 6.05c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.84 3.5 14.66 2.5 12 2.5 8.24 2.5 5 4.7 3.88 7.36z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.1c2.6 0 4.78-.86 6.38-2.34l-3.04-2.49c-.84.6-1.97 1.04-3.34 1.04-2.59 0-4.78-1.72-5.56-4.04l-3.2 2.47C4.84 18.92 8.13 21.1 12 21.1z"
      />
      <path
        fill="#4285F4"
        d="M20.92 12.02c0-.61-.07-1.08-.15-1.55H12v3.95h5.5c-.27 1.6-1.78 3.05-3.5 3.65l3.04 2.49c1.78-1.64 3.88-4.06 3.88-8.54z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [magicSent, setMagicSent] = React.useState<string | null>(null);
  const [signupSent, setSignupSent] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);

  const signInForm = useForm<SignInData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const magicForm = useForm<MagicData>({
    resolver: zodResolver(magicSchema),
    defaultValues: { email: "" },
  });

  const callbackUrl = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;

  const onGoogle = async () => {
    try {
      setGoogleLoading(true);
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    } catch (err) {
      setGoogleLoading(false);
      toast.error(
        err instanceof Error ? translateAuthError(err.message) : "התחברות עם Google נכשלה",
      );
    }
  };

  const onSignIn = async ({ email, password }: SignInData) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.replace("/schedule");
    } catch (err) {
      toast.error(err instanceof Error ? translateAuthError(err.message) : "התחברות נכשלה");
    }
  };

  const onSignUp = async ({ fullName, email, password }: SignUpData) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: callbackUrl(),
        },
      });
      if (error) throw error;
      // If session is returned, email confirmation is OFF — sign user in.
      if (data.session) {
        router.replace("/onboarding");
        return;
      }
      // Email confirmation ON — show "check your inbox" screen with resend.
      setSignupSent(email);
      signUpForm.reset();
    } catch (err) {
      toast.error(err instanceof Error ? translateAuthError(err.message) : "יצירת חשבון נכשלה");
    }
  };

  const onResendVerification = async () => {
    if (!signupSent) return;
    try {
      setResending(true);
      const supabase = getSupabase();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signupSent,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      toast.success("האימייל נשלח שוב — בדוק/י את תיבת הדואר");
    } catch (err) {
      toast.error(err instanceof Error ? translateAuthError(err.message) : "שליחה חוזרת נכשלה");
    } finally {
      setResending(false);
    }
  };

  const onMagic = async ({ email }: MagicData) => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      setMagicSent(email);
    } catch (err) {
      toast.error(err instanceof Error ? translateAuthError(err.message) : "שליחת הקישור נכשלה");
    }
  };

  return (
    <main className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <h1 className="sr-only">כניסה לסידור4S</h1>
      <section aria-labelledby="login-title" className="w-full max-w-sm">
      <Card className="glass-card w-full">
        <CardHeader>
          <div className="mb-3 flex justify-center">
            <Logo size={36} />
          </div>
          <CardTitle id="login-title" className="text-center">ברוכים הבאים</CardTitle>
          <CardDescription className="text-center">
            התחבר/י כדי להמשיך לסידור העבודה.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            onClick={onGoogle}
            disabled={googleLoading}
          >
            <GoogleIcon className="h-4 w-4" />
            {googleLoading ? "מעביר…" : "המשך עם Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">או</span>
            </div>
          </div>

          <Tabs defaultValue="signin" dir="rtl">
            <TabsList>
              <TabsTrigger value="signin">כניסה</TabsTrigger>
              <TabsTrigger value="signup">הרשמה</TabsTrigger>
              <TabsTrigger value="magic">קישור קסם</TabsTrigger>
            </TabsList>

            {/* --- Sign in --- */}
            <TabsContent value="signin">
              <form
                onSubmit={signInForm.handleSubmit(onSignIn)}
                className="space-y-3"
                noValidate
              >
                <div className="space-y-1">
                  <Label htmlFor="signin-email">דוא״ל</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    {...signInForm.register("email")}
                    aria-invalid={!!signInForm.formState.errors.email}
                  />
                  {signInForm.formState.errors.email ? (
                    <p className="text-xs text-destructive" role="alert">
                      {signInForm.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signin-password">סיסמה</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    autoComplete="current-password"
                    {...signInForm.register("password")}
                    aria-invalid={!!signInForm.formState.errors.password}
                  />
                  {signInForm.formState.errors.password ? (
                    <p className="text-xs text-destructive" role="alert">
                      {signInForm.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  variant="glow"
                  className="w-full"
                  disabled={signInForm.formState.isSubmitting}
                >
                  {signInForm.formState.isSubmitting ? "מתחבר…" : "התחבר"}
                </Button>
              </form>
            </TabsContent>

            {/* --- Sign up --- */}
            <TabsContent value="signup">
              {signupSent ? (
                <div className="space-y-3 text-sm" role="status" aria-live="polite">
                  <div className="rounded-md border border-success/30 bg-success/5 p-3">
                    <div className="font-medium">שלחנו אליך אימייל אימות</div>
                    <div className="mt-1 break-all text-muted-foreground">
                      {signupSent}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    בדוק/י גם את תיקיית הספאם. הקישור תקף ל-24 שעות.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={onResendVerification}
                      disabled={resending}
                    >
                      {resending ? "שולח…" : "שלח שוב"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setSignupSent(null)}
                    >
                      הרשמה עם דוא״ל אחר
                    </Button>
                  </div>
                </div>
              ) : (
              <form
                onSubmit={signUpForm.handleSubmit(onSignUp)}
                className="space-y-3"
                noValidate
              >
                <div className="space-y-1">
                  <Label htmlFor="signup-name">שם מלא</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    {...signUpForm.register("fullName")}
                    aria-invalid={!!signUpForm.formState.errors.fullName}
                  />
                  {signUpForm.formState.errors.fullName ? (
                    <p className="text-xs text-destructive" role="alert">
                      {signUpForm.formState.errors.fullName.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-email">דוא״ל</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    {...signUpForm.register("email")}
                    aria-invalid={!!signUpForm.formState.errors.email}
                  />
                  {signUpForm.formState.errors.email ? (
                    <p className="text-xs text-destructive" role="alert">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="signup-password">סיסמה</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      {...signUpForm.register("password")}
                      aria-invalid={!!signUpForm.formState.errors.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute inset-y-0 end-2 inline-flex items-center px-2 text-xs text-muted-foreground hover:text-foreground"
                      aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                    >
                      {showPw ? "הסתר" : "הצג"}
                    </button>
                  </div>
                  {signUpForm.watch("password") ? (
                    (() => {
                      const s = passwordStrength(signUpForm.watch("password"));
                      return (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex h-1 flex-1 gap-1">
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className={cn(
                                  "h-full flex-1 rounded-full transition-colors",
                                  i <= s.score
                                    ? s.tone === "success"
                                      ? "bg-success"
                                      : s.tone === "warning"
                                        ? "bg-warning"
                                        : "bg-destructive"
                                    : "bg-muted",
                                )}
                              />
                            ))}
                          </div>
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              s.tone === "success"
                                ? "text-success"
                                : s.tone === "warning"
                                  ? "text-warning"
                                  : "text-destructive",
                            )}
                          >
                            {s.label}
                          </span>
                        </div>
                      );
                    })()
                  ) : null}
                  {signUpForm.formState.errors.password ? (
                    <p className="text-xs text-destructive" role="alert">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  בלחיצה על "צור חשבון" אתם מאשרים את{" "}
                  <a href="/terms" className="underline">תנאי השימוש</a> ואת{" "}
                  <a href="/privacy" className="underline">מדיניות הפרטיות</a>.
                </p>
                <Button
                  type="submit"
                  variant="glow"
                  className="w-full"
                  disabled={signUpForm.formState.isSubmitting}
                >
                  {signUpForm.formState.isSubmitting ? "יוצר…" : "צור חשבון"}
                </Button>
              </form>
              )}
            </TabsContent>

            {/* --- Magic link --- */}
            <TabsContent value="magic">
              {magicSent ? (
                <div className="space-y-2 text-sm" role="status" aria-live="polite">
                  <div className="font-medium">קישור נשלח אל {magicSent}</div>
                  <p className="text-muted-foreground">
                    בדוק את תיבת הדואר הנכנס ולחץ על הקישור כדי להתחבר.
                  </p>
                  <Button
                    variant="link"
                    onClick={() => setMagicSent(null)}
                    className="p-0"
                  >
                    שלח שוב
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={magicForm.handleSubmit(onMagic)}
                  className="space-y-3"
                  noValidate
                >
                  <div className="space-y-1">
                    <Label htmlFor="magic-email">דוא״ל</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      {...magicForm.register("email")}
                      aria-invalid={!!magicForm.formState.errors.email}
                    />
                    {magicForm.formState.errors.email ? (
                      <p className="text-xs text-destructive" role="alert">
                        {magicForm.formState.errors.email.message}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    variant="glow"
                    className="w-full"
                    disabled={magicForm.formState.isSubmitting}
                  >
                    <Mail className="h-4 w-4" />
                    {magicForm.formState.isSubmitting
                      ? "שולח…"
                      : "שלח קישור"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </section>
    </main>
  );
}
