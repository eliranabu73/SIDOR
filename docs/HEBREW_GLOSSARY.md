# Hebrew Glossary — sidor4S

Authoritative list of Hebrew UI terms. Use these forms in every user-facing string under `web/app/**` and `web/components/**`. If you need a new term, add it here first.

## Core nouns

| Concept           | Term            | Notes                                                              |
| ----------------- | --------------- | ------------------------------------------------------------------ |
| Weekly schedule   | סידור           | Default. "סידור משמרות" / "סידור שבועי" when disambiguation is needed. **Do not use "לוח" alone.** |
| Shift             | משמרת           | Plural: משמרות.                                                    |
| Employee          | עובד/ת          | Inclusive form for labels, placeholders, and ARIA. Plural: עובדים. |
| Role              | תפקיד           | Plural: תפקידים.                                                   |
| Location / Branch | סניף            | Plural: סניפים. **Do not use "מיקום" in the UI.**                  |
| Template          | תבנית           | Plural: תבניות. **Do not use "טמפלייט".**                          |
| Organization      | ארגון / עסק     | "ארגון" in onboarding/settings, "עסק" in marketing copy.           |
| Availability      | זמינות          |                                                                    |
| Time off          | חופש            | Request: "בקשת חופש".                                              |
| Swap              | החלפה           | "בקשת החלפה" for a swap request.                                   |
| Fairness          | הוגנות          |                                                                    |
| Auto-assign       | שיבוץ אוטומטי   | Verb: "לשבץ"; result: "שיבוץ".                                     |
| Publish           | פרסום / לפרסם   | Schedule publishing flow.                                          |
| Export            | ייצוא           |                                                                    |

## Button verbs (imperative)

| Action  | Term     | Notes                                  |
| ------- | -------- | -------------------------------------- |
| Create  | צור      | "צור משמרת", "צור חשבון".              |
| Save    | שמור     | Loading state: "שומר…".                |
| Edit    | ערוך     |                                        |
| Delete  | מחק      | Confirmation prompts: "האם למחוק …?".  |
| Cancel  | ביטול    | Used as a noun-label on Cancel buttons (Hebrew convention). |
| Confirm | אישור    |                                        |
| Add     | הוסף     | Loading state: "מוסיף…".               |
| Apply   | החל      | For applying templates / proposals.    |

## Toast / error guidelines

- Never use a bare `"שגיאה"`. Be specific: `"שמירת ההגדרות נכשלה"`, `"יצירת הסניף נכשלה"`, `"החלת התבנית נכשלה"`.
- Success toasts in past tense: `"סניף נמחק"`, `"תפקיד עודכן"`, `"הסידור פורסם"`.
- Loading button labels use present participle with an ellipsis: `"שומר…"`, `"מוסיף…"`, `"מחיל…"`, `"שולח…"`.

## Legal / rules vocabulary

- Constraints get **applied / enforced**, not "tried": use **"ייאכפו"** or **"ייושמו"**, never `"ינוסו"` (means "will be tested").
- Work rules: "כללי עבודה".
- Compliance with law: "תאימות לחוק".

## Style notes

- Use Hebrew quote marks `״` for abbreviations: `דוא״ל`, `סופ״שים`.
- Em dash `—` is preferred over hyphens for compound clauses.
- Numbers stay in Western digits; ordinals like day-of-week use one-letter Hebrew with geresh: `א׳`, `ב׳`.
- ARIA labels follow the same vocabulary as visible labels (e.g. `aria-label="חיפוש עובד/ת"`).

## Files reviewed in the 2026-05 copy sweep

All `.tsx` files under `web/app/**` and `web/components/**` (except `web/app/layout.tsx`, which is owned by the iOS PWA polish track). Backend Hebrew strings are not in scope yet.
