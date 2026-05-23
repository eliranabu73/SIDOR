import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/marketing/Footer";
import {
  INDUSTRIES_CONTENT,
  INDUSTRY_SLUGS,
  type IndustrySlug,
} from "@/lib/industries-content";

export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_SLUGS.map((slug) => ({ slug }));
}

function isValidSlug(slug: string): slug is IndustrySlug {
  return (INDUSTRY_SLUGS as readonly string[]).includes(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return { title: "תחום לא נמצא | סידור4S" };
  }
  const content = INDUSTRIES_CONTENT[slug];
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical: `/industries/${slug}` },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      type: "website",
      locale: "he_IL",
    },
  };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const content = INDUSTRIES_CONTENT[slug];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/features">תכונות</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/pricing">מחירים</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/industries">תחומים</Link>
            </Button>
            <ThemeToggle />
            <Button asChild size="sm" variant="glow">
              <Link href="/login">התחברות</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-background to-slate-50/40 dark:to-slate-900/40">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <div className="text-6xl mb-4" aria-hidden>
            {content.emoji}
          </div>
          <Badge variant="outline" className="mb-4 border-indigo-500/40 text-indigo-500">
            {content.label}
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            {content.h1}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            {content.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל בחינם</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/schedule">צפה בדמו</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              האתגרים שאתה מכיר
            </h2>
            <p className="mt-3 text-muted-foreground">
              לפני הפתרון, בואו נדבר על מה שכואב באמת.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {content.painPoints.map((p) => (
              <Card key={p.title} className="bg-card border-rose-500/20">
                <CardContent className="p-6">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {p.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features / solutions */}
      <section className="border-b border-border bg-slate-50/40 dark:bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              איך סידור4S פותר את זה
            </h2>
            <p className="mt-3 text-muted-foreground">
              שלוש יכולות שתוכננו במיוחד לתחום שלך.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {content.features.map((f) => (
              <Card key={f.title} className="bg-card border-indigo-500/20">
                <CardContent className="p-6">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-cyan-400/15 text-indigo-500">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Sample shift template */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              תבנית סידור לדוגמה
            </h2>
            <p className="mt-3 text-muted-foreground">
              איך נראה סידור טיפוסי בתחום שלך — מוכן לעריכה ושכפול.
            </p>
          </div>
          <Card className="mt-10 overflow-hidden bg-card">
            <CardContent className="p-6">
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  תפקידים נפוצים
                </h3>
                <div className="flex flex-wrap gap-2">
                  {content.sampleRoles.map((role) => (
                    <Badge
                      key={role}
                      variant="outline"
                      className="border-indigo-500/30"
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  משמרות דוגמה
                </h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-right font-semibold">יום</th>
                        <th className="px-4 py-2 text-right font-semibold">תפקיד</th>
                        <th className="px-4 py-2 text-right font-semibold">שעות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {content.sampleShifts.map((s, i) => (
                        <tr key={i} className="bg-card">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {s.day}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {s.role}
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground" dir="ltr">
                            {s.time}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Testimonial */}
      <section className="border-b border-border bg-slate-50/40 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <Card className="bg-card ring-2 ring-indigo-500/20 shadow-[0_0_60px_-12px_rgb(99_102_241/0.35)]">
            <CardContent className="p-8 sm:p-10">
              <Badge
                variant="outline"
                className="mb-4 border-indigo-500/40 text-indigo-500"
              >
                שותף עיצובי
              </Badge>
              <blockquote className="text-xl font-medium text-foreground leading-relaxed">
                &ldquo;{content.testimonial.quote}&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-white font-bold"
                  aria-hidden
                >
                  {content.testimonial.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {content.testimonial.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {content.testimonial.role}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Compliance */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  תאימות מובנית לחוק הישראלי
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {content.complianceNote}
                </p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    "שעות נוער",
                    "מנוחה שבועית 36 שעות",
                    "חוקי שבת",
                    "הפסקות חובה",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-b border-border bg-gradient-to-br from-indigo-500/10 via-background to-cyan-400/10">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            מוכן לנסות ב{content.label}?
          </h2>
          <p className="mt-3 text-muted-foreground">
            הגדרה ראשונית של 10 דקות. הסידור הראשון אצלך כבר היום.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל ניסיון 14 יום — בלי כרטיס אשראי</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/industries">
                <ArrowLeft className="h-4 w-4" />
                לכל התחומים
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
