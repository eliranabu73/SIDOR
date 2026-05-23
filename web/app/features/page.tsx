import type { Metadata } from "next";
import Link from "next/link";
import {
  Brain,
  MessageCircle,
  Users,
  ShieldCheck,
  Gauge,
  FileDown,
  Check,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "תכונות — סידור4S | כל מה שצריך כדי לנהל סידורי עבודה",
  description:
    "אופטימייזר AI, מנוע תאימות לחוק עבודה ישראלי, וואטסאפ נטיב, מד עלויות בזמן אמת, וייצוא לחישוב שכר. כל מה שצריך לסידור עבודה חכם.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "תכונות — סידור4S",
    description: "אופטימייזר AI, מנוע חוק עבודה, וואטסאפ, מד עלויות וייצוא שכר.",
    type: "website",
    locale: "he_IL",
  },
};

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  paragraph: string;
  bullets: string[];
};

const FEATURES: Feature[] = [
  {
    icon: Brain,
    title: "שיבוץ אוטומטי עם AI",
    paragraph:
      "אופטימייזר חכם שמייצר סידור שבועי תוך שניות, מאזן עומסים, ושומר על הוגנות בין העובדים.",
    bullets: [
      "אופטימייזר מבוסס AI ששוקל זמינות, העדפות וכישורים",
      "מנוע הוגנות שמחלק משמרות סופ״ש ולילה שווה בשווה",
      "חוקי עבודה משולבים — לא נשבר מנוחה שבועית או הפסקות",
      "תבניות שבועיות שניתן לשכפל ולהתאים בכמה לחיצות",
    ],
  },
  {
    icon: MessageCircle,
    title: "וואטסאפ נטיב — בלי אפליקציה לעובדים",
    paragraph:
      "כל עובד מקבל קישור אישי בוואטסאפ עם המשמרות שלו. החלפות, בקשות חופש ואישורים — הכל בערוץ שכבר משתמשים בו.",
    bullets: [
      "קישור אישי לכל עובד עם כל המשמרות בשבוע ובחודש",
      "בקשות החלפה בקליק — עובד בוחר חבר ושולח",
      "אישורי קריאה — רואים מי ראה את הסידור",
      "תזכורות אוטומטיות 24 שעות לפני משמרת",
    ],
  },
  {
    icon: Users,
    title: "ניהול עובדים מקיף",
    paragraph:
      "פרופיל לכל עובד עם זמינות, כישורים, סוגי משרה וחוזים — כל המידע במקום אחד.",
    bullets: [
      "ייבוא עובדים בכמות מקובץ CSV",
      "זמינות שבועית קבועה + חריגות נקודתיות",
      "כישורים והרשאות לכל תפקיד",
      "ניהול חופשות, מחלות והיעדרויות",
    ],
  },
  {
    icon: ShieldCheck,
    title: "מנוע תאימות לחוק עבודה ישראלי",
    paragraph:
      "אנחנו לא רק מציגים תזכורות — המערכת חוסמת סידור שמפר את החוק ומסבירה למה.",
    bullets: [
      "מנוחה שבועית של 36 שעות רצופות",
      "מגבלות שעות נוער (עד 22:00, מקסימום שעות יומי)",
      "מנוחה מינימלית בין משמרות (8 שעות)",
      "חוקי שבת, חגים ומגבלות שעות נוספות",
    ],
  },
  {
    icon: Gauge,
    title: "מד עלויות בזמן אמת",
    paragraph:
      "רואים את עלות השכר של הסידור לפני שמירה. שינוי משמרת — שינוי בעלות. שקיפות מלאה מול תקציב.",
    bullets: [
      "חישוב עלות שבועית, יומית ולכל משמרת",
      "אזהרות חריגה מתקציב",
      "תחשיב שעות נוספות, סופ״ש וגמול לילה",
      "השוואה למחזור בפועל (אם מחובר לקופה)",
    ],
  },
  {
    icon: FileDown,
    title: "ייצוא לכל יעד — PDF, PNG, CSV לחשבות שכר",
    paragraph:
      "מתממשק עם תוכנות השכר הישראליות הנפוצות. ייצוא של דקה במקום שעה של העתק-הדבק.",
    bullets: [
      "PDF/PNG מעוצב להדפסה ולהדבקה בלוח מודעות",
      "CSV מוכן ל-Michpal, Hilan, חילן, רמדור ועוד",
      "דוחות שעות מצרפיים לחשבת שכר",
      "ארכיון מלא של כל הסידורים — חיפוש לפי תאריך",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="סידור4S — דף הבית">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/pricing">מחירים</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/industries">תחומים</Link>
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
            כל הכלים. בעברית. תואמים לחוק.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            אופטימייזר AI, מנוע חוק עבודה ישראלי, וואטסאפ, מד עלויות וייצוא לכל
            תוכנת שכר — מערכת אחת קצה לקצה.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל ניסיון 14 יום — חינם</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/schedule">צפה בדמו</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20 space-y-16">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            const reverse = idx % 2 === 1;
            return (
              <div
                key={feature.title}
                className={`grid gap-10 lg:grid-cols-2 lg:items-center ${
                  reverse ? "lg:[&>div:first-child]:order-2" : ""
                }`}
              >
                {/* Copy */}
                <div>
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-400/15 text-indigo-500">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold text-foreground sm:text-3xl">
                    {feature.title}
                  </h2>
                  <p className="mt-3 text-muted-foreground leading-relaxed">
                    {feature.paragraph}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
                          <Check className="h-3 w-3" />
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Button asChild size="sm" variant="glow">
                      <Link href="/login">התחל ניסיון</Link>
                    </Button>
                  </div>
                </div>

                {/* Screenshot placeholder */}
                <Card className="overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border-border/60">
                  <div
                    aria-hidden
                    className="flex aspect-video items-center justify-center"
                  >
                    <div className="text-center">
                      <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white/60 text-indigo-500 shadow-inner dark:bg-slate-900/60">
                        <Icon className="h-10 w-10" />
                      </div>
                      <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
                        תצוגה מקדימה
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {feature.title}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border bg-slate-50/40 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            מוכן לנסות?
          </h2>
          <p className="mt-3 text-muted-foreground">
            14 יום של גישה מלאה. בלי כרטיס אשראי. בלי חיובים מפתיעים.
          </p>
          <div className="mt-6">
            <Button asChild size="lg" variant="glow">
              <Link href="/login">התחל ניסיון חינם</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
