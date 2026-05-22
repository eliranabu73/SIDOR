import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  priceLabel: string;
  perBiz: string;
  highlight?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    priceLabel: "0 ₪",
    perBiz: "תמיד חינם",
    features: [
      "צפייה בסידור מפורסם",
      "מנהל יחיד, עד 5 עובדים",
      "ייצוא ל-PDF",
    ],
  },
  {
    name: "Basic",
    priceLabel: "12 ₪",
    perBiz: "לעובד / חודש · או 99 ₪ לעסק קטן",
    features: ["שיבוץ ידני מלא", "שעון נוכחות", "סניף יחיד"],
  },
  {
    name: "Pro",
    priceLabel: "22 ₪",
    perBiz: "לעובד / חודש · או 199 ₪ לעסק קטן",
    highlight: true,
    features: [
      "שיבוץ אוטומטי חכם",
      "אכיפת חוקי עבודה ישראליים",
      "דוחות וניתוחים",
      "שוק החלפות פנימי",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            מחירים שמתאימים לעסק ישראלי
          </h2>
          <p className="mt-3 text-muted-foreground">
            בתקופת הביטא — כל המסלולים פתוחים בחינם. מחיר רק כשנפיק לך ערך.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "relative overflow-hidden bg-card transition-all duration-300",
                tier.highlight
                  ? "border-transparent ring-2 ring-indigo-500/70 shadow-[0_0_60px_-12px_rgb(99_102_241/0.55)] hover:-translate-y-1"
                  : "hover:-translate-y-0.5 hover:shadow-lg",
              )}
            >
              {tier.highlight ? (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-px rounded-[inherit] bg-gradient-to-br from-indigo-500/20 via-transparent to-cyan-400/20"
                  />
                  <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-3 py-0.5 text-xs font-semibold text-white shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    הכי פופולרי
                  </span>
                </>
              ) : null}

              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <Badge variant="secondary">חינם בתקופת הביטא</Badge>
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
                    {tier.priceLabel}
                  </span>
                </div>
                <CardDescription>{tier.perBiz}</CardDescription>
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
      </div>
    </section>
  );
}
