import { ChevronDown } from "lucide-react";

type QA = { q: string; a: string };

const FAQS: QA[] = [
  {
    q: "האם יש אפליקציה לעובדים?",
    a: "כרגע העובדים מקבלים את הסידור בוואטסאפ עם קישור אישי לצפייה והחלפות. אפליקציה ייעודית בפיתוח ותשוחרר בקרוב — בלי צורך לשנות כלום אצלך.",
  },
  {
    q: "כמה זמן לוקח להגדיר את המערכת?",
    a: "מנהל ממוצע מסיים הגדרה ראשונית תוך 10 דקות: סניף, עובדים, ומשמרות שבועיות. את הסידור הראשון תקבל אוטומטית באותו היום.",
  },
  {
    q: "האם המערכת תואמת לחוק עבודה ומנוחה הישראלי?",
    a: "כן. מנוע התאימות בודק מנוחה שבועית, הפסקות, שעות נוער, ומגבלות שעות נוספות — בכל לחיצה על &quot;צור סידור&quot;. אנחנו מתעדכנים שוטף לפי משרד העבודה.",
  },
  {
    q: "האם אפשר לבטל בכל זמן?",
    a: "בהחלט. אין התחייבות, אין קנסות. מבטלים בלחיצה אחת מתוך ההגדרות וממשיכים להשתמש במסלול ה-Free.",
  },
  {
    q: "איך עובד השליחה דרך WhatsApp?",
    a: "אנחנו יוצרים קישור אישי לכל עובד עם המשמרות שלו. שולחים בלחיצה אחת לכל הצוות — בלי לאסוף מספרים, בלי קבוצות, בלי הודעות שמתפספסות.",
  },
  {
    q: "מה קורה כשעולים על מגבלת התוכנית?",
    a: "אנחנו מודיעים מראש ומציעים שדרוג שקוף. הסידור הקיים ממשיך לעבוד — לעולם לא נחסום לך גישה לנתונים שלך.",
  },
  {
    q: "האם הנתונים שלי בטוחים?",
    a: "כל הנתונים מוצפנים במנוחה ובתעבורה, מאוחסנים בענן עם גיבוי יומי. תואמים לדרישות GDPR ו-SOC2 ready. רק את ההנהלה שלך יש לה גישה.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-b border-border bg-background">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            שאלות נפוצות
          </h2>
          <p className="mt-3 text-muted-foreground">
            לא מצאת תשובה? כתוב לנו ב-WhatsApp ונחזור תוך שעה.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {FAQS.map((item, idx) => (
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
  );
}
