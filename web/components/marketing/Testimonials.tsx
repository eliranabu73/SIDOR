import { Star } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "חסכתי 5 שעות בכל שבוע. הצוות מקבל את הסידור בוואטסאפ ואני שקטה שאין חריגות חוק.",
    name: "דנה כהן",
    role: "מנהלת מסעדה, חיפה",
  },
  {
    quote:
      "בלי אקסל, בלי בלגן. תוך 3 דקות יש לי סידור לכל הסניפים.",
    name: "איתי מזרחי",
    role: "בעל רשת חנויות סלולר",
  },
  {
    quote:
      "החוקים של חוק העזרה לנוער כתובים ידנית — סוף סוף משהו שמבין את ישראל.",
    name: "נועה אברהם",
    role: "מנהלת צהרון",
  },
];

export function Testimonials() {
  return (
    <section
      id="testimonials"
      className="border-b border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            עסקים אמיתיים, חיסכון אמיתי
          </h2>
          <p className="mt-3 text-muted-foreground">
            פיילוט פתוח — הציטוטים מ-design partners.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <Card
              key={t.name}
              className="bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <CardHeader>
                <div
                  className="flex items-center gap-1 text-amber-500"
                  aria-label="5 כוכבים מתוך 5"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-current"
                      aria-hidden
                    />
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <blockquote className="text-base leading-relaxed text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
