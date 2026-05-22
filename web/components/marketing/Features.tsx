import {
  CalendarCheck,
  Scale,
  Share2,
  Sparkles,
  Zap,
  ShieldCheck,
} from "lucide-react";

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

        <div className="bento-grid mt-12">
          {/* Hero card — span 2 cols, brand gradient */}
          <article className="bento-card bento-card-brand bento-wide">
            <div className="flex items-center gap-2 text-sm font-medium opacity-90">
              <Sparkles className="h-4 w-4" />
              שיבוץ אוטומטי
            </div>
            <div>
              <h3 className="mt-4 text-2xl font-bold leading-tight">
                סידור שבועי שלם
                <br />
                בלחיצה אחת
              </h3>
              <p className="mt-3 max-w-md text-sm opacity-90">
                המערכת מאזנת עומסים, מעדיפה את העובדים המתאימים ומונעת
                קונפליקטים מראש. אתה רק מאשר.
              </p>
            </div>
          </article>

          {/* Israeli labor compliance */}
          <article className="bento-card bento-corner-glow">
            <FeatureIcon icon={Scale} />
            <div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                חוקי עבודה ישראליים
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                אכיפה אוטומטית של מנוחה שבועית, שעות נוספות, ערבי חג
                ומילואים.
              </p>
            </div>
          </article>

          {/* WhatsApp export */}
          <article className="bento-card bento-corner-glow">
            <FeatureIcon icon={Share2} />
            <div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                ייצוא לוואטסאפ
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                PDF/PNG בלחיצה — שולחים לקבוצת העובדים. בלי אפליקציה לעובדים.
              </p>
            </div>
          </article>

          {/* Real-time collaboration — span 2 */}
          <article className="bento-card bento-wide bento-card-dark">
            <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
              <Zap className="h-4 w-4" />
              שיתוף בזמן אמת
            </div>
            <div>
              <h3 className="mt-4 text-xl font-bold">
                כמה מנהלים, אותו סידור
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                שינויים מסתנכרנים אוטומטית. אין יותר WhatsApp עם 12 גרסאות
                Excel.
              </p>
            </div>
          </article>

          {/* Smart calendar */}
          <article className="bento-card bento-corner-glow">
            <FeatureIcon icon={CalendarCheck} />
            <div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                העדפות עובדים
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                כל עובד מסמן זמינות. המערכת מכבדת בקשות ומאזנת בין הצוות.
              </p>
            </div>
          </article>

          {/* Security */}
          <article className="bento-card bento-corner-glow">
            <FeatureIcon icon={ShieldCheck} />
            <div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                בידוד מלא בין עסקים
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Multi-tenant מאובטח עם RLS. הנתונים שלך לא יוצאים מהארגון
                שלך.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function FeatureIcon({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-cyan-400/15 ring-1 ring-indigo-500/30">
      <Icon className="h-5 w-5 text-indigo-500" />
    </div>
  );
}
