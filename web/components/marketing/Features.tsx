import { CalendarCheck, Scale, Share2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: CalendarCheck,
    title: "שיבוץ אוטומטי",
    description:
      "בלחיצה אחת המערכת בונה סידור שבועי שלם — מאזנת עומסים, מעדיפה את העובדים המתאימים ומונעת קונפליקטים מראש.",
  },
  {
    icon: Scale,
    title: "חוקי עבודה ישראליים",
    description:
      "אכיפה אוטומטית של מנוחה שבועית, שעות נוספות, ערבי חג ומילואים. המנהל מקבל התרעה לפני שהוא חותם על משמרת אסורה.",
  },
  {
    icon: Share2,
    title: "ייצוא ל-WhatsApp",
    description:
      "מייצרים PDF או PNG של הסידור בלחיצה ושולחים לקבוצת העובדים בוואטסאפ. בלי אפליקציה ובלי התקנות לעובדים.",
  },
];

export function Features() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            כל מה שמנהל משמרת בישראל באמת צריך
          </h2>
          <p className="mt-3 text-muted-foreground">
            בנינו את הכלי שחסר לשוק המקומי — לא עוד תרגום של מערכת אמריקאית.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="bg-card">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <CardTitle className="mt-3 text-lg">{title}</CardTitle>
                <CardDescription className="leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
