import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Footer } from "@/components/marketing/Footer";
import {
  INDUSTRIES_CONTENT,
  INDUSTRY_SLUGS,
} from "@/lib/industries-content";

export const metadata: Metadata = {
  title: "תוכנה לסידור עבודה לפי תחום | סידור4S",
  description:
    "סידור משמרות מותאם לתחום שלך: מסעדה, קמעונאות, צהרון, מרפאה, קייטרינג, מוסך ועוד. תואם חוק עבודה ישראלי, שולח בוואטסאפ.",
  alternates: { canonical: "/industries" },
  openGraph: {
    title: "תוכנה לסידור עבודה לפי תחום — סידור4S",
    description:
      "סידור משמרות מותאם לתחום שלך — מסעדה, קמעונאות, צהרון, מרפאה ועוד.",
    type: "website",
    locale: "he_IL",
  },
};

export default function IndustriesIndexPage() {
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
              <Link href="/schedule">דמו</Link>
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
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            סידור עבודה — מותאם לתחום שלך
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            לכל ענף יש חוקים, תפקידים ועונות אחרות. בחר את התחום שלך כדי לראות
            איך סידור4S פותר את האתגרים הספציפיים שלך.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRY_SLUGS.map((slug) => {
              const content = INDUSTRIES_CONTENT[slug];
              return (
                <Link
                  key={slug}
                  href={`/industries/${slug}`}
                  className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl"
                >
                  <Card className="h-full bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-500/40">
                    <CardContent className="p-6">
                      <div className="text-4xl" aria-hidden>
                        {content.emoji}
                      </div>
                      <h2 className="mt-4 text-xl font-bold text-foreground">
                        {content.label}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        {content.shortBenefit}
                      </p>
                      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-500 group-hover:gap-2 transition-all">
                        <span>ראה פתרון</span>
                        <ArrowLeft className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border bg-slate-50/40 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            לא מצאת את התחום שלך?
          </h2>
          <p className="mt-3 text-muted-foreground">
            סידור4S מתאים כמעט לכל עסק עם משמרות. נסה בחינם ונבנה איתך תבנית
            מותאמת.
          </p>
          <div className="mt-6">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל ניסיון 14 יום — בלי כרטיס אשראי</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
