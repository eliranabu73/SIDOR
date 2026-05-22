import { CalendarCheck, ShieldCheck, Zap, Code2, Users } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "שיבוץ אוטומטי",
    description: "בינה מלאכותית ממלאת את לוח המשמרות תוך שניות, תוך שמירה על כל כללי העסק שלך",
    wide: true,
    gradient: true,
  },
  {
    icon: ShieldCheck,
    title: "תאימות לחוק העבודה",
    description: "כללי עבודה ישראלים מובנים — מנוחה, שעות מקסימום, ועוד",
    wide: false,
    gradient: false,
  },
  {
    icon: Users,
    title: "ניהול עובדים",
    description: "תפקידים, זמינות, ועדיפויות — הכל במקום אחד",
    wide: false,
    gradient: false,
  },
  {
    icon: CalendarCheck,
    title: "תבניות מוכנות",
    description: "6 תבניות לפי ענף — מסעדה, מלון, קמעונאות ועוד",
    wide: false,
    gradient: false,
  },
  {
    icon: Code2,
    title: "API-first",
    description: "אינטגרציה קלה עם כל מערכת",
    wide: false,
    gradient: false,
  },
];

export function Features() {
  return (
    <section className="py-20 px-4 max-w-6xl mx-auto">
      <h2 className="text-center text-3xl font-bold mb-12">הכל במקום אחד</h2>
      <div className="bento-grid">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className={`rounded-3xl p-8 border transition-all duration-300 hover:-translate-y-0.5 ${
                f.wide ? "bento-card-wide" : ""
              } ${
                f.gradient
                  ? "bg-gradient-to-br from-[#6366F1] to-[#22D3EE] text-white border-transparent"
                  : "bg-card border-border hover:border-[#6366F1]/30"
              }`}
            >
              <div className={`inline-flex p-2.5 rounded-xl mb-4 ${f.gradient ? "bg-white/20" : "bg-[#6366F1]/10"}`}>
                <Icon className={`h-5 w-5 ${f.gradient ? "text-white" : "text-[#6366F1]"}`} />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className={`text-sm ${f.gradient ? "text-white/80" : "text-muted-foreground"}`}>{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
