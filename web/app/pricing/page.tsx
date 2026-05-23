import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Pricing } from "@/components/marketing/Pricing";
import { Footer } from "@/components/marketing/Footer";
import { RoiCalculator } from "./RoiCalculator";

export const metadata: Metadata = {
  title: "מחירים — סידור4S | תוכנת סידור עבודה לעסקים ישראלים",
  description:
    "מחירים פשוטים וללא הפתעות. החל מ-₪59/חודש. ניסיון 14 יום בחינם, ללא כרטיס אשראי. תואם חוק עבודה ישראלי.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "מחירים — סידור4S",
    description:
      "מחירים פשוטים וללא הפתעות. החל מ-₪59/חודש. ניסיון 14 יום בחינם.",
    type: "website",
    locale: "he_IL",
  },
};

const PRICING_FAQS = [
  {
    q: "האם יש התחייבות לזמן מינימום?",
    a: "לא. כל החבילות חודש-לחודש, מבטלים בלחיצה אחת מההגדרות. אם בחרת חיוב שנתי — ההנחה של 20% משולמת מראש, אבל ניתן לבטל ולקבל החזר יחסי.",
  },
  {
    q: "מה כלול בניסיון של 14 יום?",
    a: "גישה מלאה לחבילת Business — עד 40 עובדים, אופטימייזר AI, ייצוא שכר, ניהול חופשות. בלי כרטיס אשראי, בלי חיובים מפתיעים בסוף הניסיון.",
  },
  {
    q: "מה קורה אם חרגתי ממספר העובדים?",
    a: "אנחנו מודיעים מראש ומציעים שדרוג שקוף. הסידור הקיים ממשיך לעבוד — לעולם לא נחסום לך גישה לנתונים.",
  },
  {
    q: "אילו אמצעי תשלום אתם מקבלים?",
    a: "כרטיסי אשראי ישראליים (ויזה, מאסטרקרד, אמריקן אקספרס, ישראכרט), העברה בנקאית להזמנות שנתיות, וחשבונית מס/קבלה לכל תשלום.",
  },
  {
    q: "האם המחירים כוללים מע״מ?",
    a: "המחירים המוצגים אינם כוללים מע״מ. בחשבונית מתווסף מע״מ כחוק. עסקים מורשים יכולים לקזז את המע״מ במלואו.",
  },
];

export default function PricingPage() {
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
            מחיר פשוט. ללא הפתעות.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            תכנון אחד. ארבע חבילות. בלי עמלות נסתרות, בלי שדרוגים מאולצים. בחר
            את הגודל שמתאים לעסק שלך — אפשר לשנות בכל עת.
          </p>
        </div>
      </section>

      {/* Pricing grid */}
      <Pricing />

      {/* ROI calculator */}
      <section className="border-b border-border bg-slate-50/40 dark:bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              כמה תחסוך בחודש?
            </h2>
            <p className="mt-3 text-muted-foreground">
              הזז את הסליידרים כדי לראות את החיסכון המוערך שלך — בזמן ובכסף.
            </p>
          </div>
          <div className="mt-10">
            <RoiCalculator />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              שאלות נפוצות על המחירים
            </h2>
            <p className="mt-3 text-muted-foreground">
              לא מצאת תשובה? כתוב לנו בוואטסאפ ונחזור תוך שעה.
            </p>
          </div>
          <div className="mt-12 space-y-3">
            {PRICING_FAQS.map((item, idx) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-card transition-all open:shadow-md"
                {...(idx === 0 ? { open: true } : {})}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-foreground hover:bg-accent/40 rounded-xl">
                  <span>{item.q}</span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
