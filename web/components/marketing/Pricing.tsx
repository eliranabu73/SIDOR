import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <section
      id="pricing"
      className="border-b border-border bg-background"
    >
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
              className={
                tier.highlight
                  ? "relative border-2 border-primary bg-card"
                  : "bg-card"
              }
            >
              {tier.highlight && (
                <span className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  הכי פופולרי
                </span>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <Badge variant="secondary">חינם בתקופת הביטא</Badge>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    {tier.priceLabel}
                  </span>
                </div>
                <CardDescription>{tier.perBiz}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
