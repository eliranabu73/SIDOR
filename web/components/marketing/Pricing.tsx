"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tier = {
  name: string;
  monthly: number;
  tagline: string;
  roi: string;
  highlight?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    monthly: 0,
    tagline: "להתחיל בקטן",
    roi: "מתאים לעסק חדש שבודק את המים",
    features: [
      "סניף יחיד",
      "עד 5 עובדים",
      "סידור אוטומטי בסיסי",
      "שיתוף בוואטסאפ",
    ],
  },
  {
    name: "Starter",
    monthly: 59,
    tagline: "לעסק קטן עם צוות מתפתח",
    roi: "חוסך ~6 שעות בשבוע",
    features: [
      "סניף יחיד",
      "עד 15 עובדים",
      "אופטימייזר AI",
      "מנוע תאימות לחוק עבודה",
      "מד עלויות בזמן אמת",
    ],
  },
  {
    name: "Business",
    monthly: 149,
    tagline: "המסלול הפופולרי",
    roi: "חוסך 6h + מונע קנסות עד ₪50K",
    highlight: true,
    features: [
      "עד 2 סניפים",
      "עד 40 עובדים",
      "ייצוא שכר ל-CSV",
      "ניהול חופשות והיעדרויות",
      "ייבוא עובדים בכמות",
      "כל מה ש-Starter כולל",
    ],
  },
  {
    name: "Pro",
    monthly: 299,
    tagline: "לרשתות וצוותים גדולים",
    roi: "ROI מלא + תמיכה אישית",
    features: [
      "סניפים ועובדים ללא הגבלה",
      "גישת API",
      "תמיכה בעדיפות גבוהה",
      "מנהל הצלחה ייעודי",
      "כל מה ש-Business כולל",
    ],
  },
];

function formatPrice(monthly: number, yearly: boolean): string {
  if (monthly === 0) return "₪0";
  const value = yearly ? Math.round(monthly * 0.8) : monthly;
  return `₪${value}`;
}

export function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            מחירים שמתאימים לעסק ישראלי
          </h2>
          <p className="mt-3 text-muted-foreground">
            ללא התחייבות. ניתן לבטל בכל רגע. כל המחירים בשקלים, לא כולל מע״מ.
          </p>

          <div className="mt-8 inline-flex items-center rounded-full border border-border bg-card p-1 text-sm">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium transition-colors",
                !yearly
                  ? "bg-foreground text-background shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={!yearly}
            >
              חודשי
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium transition-colors",
                yearly
                  ? "bg-foreground text-background shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={yearly}
            >
              שנתי (חסכון 20%)
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "relative bg-card transition-all duration-300",
                tier.highlight
                  ? "border-transparent ring-2 ring-indigo-500/70 shadow-[0_0_60px_-12px_rgb(99_102_241/0.55)] hover:-translate-y-1 lg:-mt-4"
                  : "overflow-hidden hover:-translate-y-0.5 hover:shadow-lg",
              )}
            >
              {tier.highlight ? (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  >
                    <div className="absolute -inset-px rounded-[inherit] bg-gradient-to-br from-indigo-500/20 via-transparent to-cyan-400/20" />
                  </div>
                  <span className="absolute -top-3 right-4 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    הכי פופולרי
                  </span>
                </>
              ) : null}

              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {yearly && tier.monthly > 0 ? (
                    <Badge variant="success">2 חודשים חינם</Badge>
                  ) : null}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    className={cn(
                      "text-4xl font-extrabold",
                      tier.highlight
                        ? "text-gradient-brand"
                        : "text-foreground",
                    )}
                  >
                    {formatPrice(tier.monthly, yearly)}
                  </span>
                  {tier.monthly > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      / חודש
                    </span>
                  ) : null}
                </div>
                <CardDescription>{tier.tagline}</CardDescription>
                <p
                  className={cn(
                    "mt-2 text-xs font-medium",
                    tier.highlight ? "text-indigo-500" : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {tier.roi}
                </p>
              </CardHeader>

              <CardContent className="relative">
                <ul className="space-y-2.5 text-sm">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-foreground"
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                          tier.highlight
                            ? "bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"
                            : "bg-indigo-500/10 text-indigo-500",
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Button asChild size="lg" variant="glow">
            <Link href="/login">התחל ניסיון 14 יום — בלי כרטיס אשראי</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            כל המחירים אינם כוללים מע״מ.
          </p>
        </div>
      </div>
    </section>
  );
}
