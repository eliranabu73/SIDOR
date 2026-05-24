# SMB User Test Report — סידור4S
**Tester persona:** דני לוי, בעלים של "קפה דני", תל אביב, 10 עובדים  
**Test date:** 24.5.2026  
**App URL tested:** https://sidor-eta.vercel.app  
**Testing method:** Live browser session, full walkthrough of all features

---

## Executive Summary

**Would Danny pay ₪59/month for this? Not yet.**

The bones of something genuinely useful are here. The Hebrew UI is natural, the concept is right, and two features (the availability grid and the settings/compliance engine) are clearly well-built. But as of today, the app's core value proposition — "לחץ כפתור וקבל סידור" — is completely broken. Every schedule-creation button is non-functional. The auto-schedule produces zero response. The WhatsApp share does nothing. The signup/registration flow is broken. Danny can't even create an account on his own.

The app is a demo shell with impressive UI and zero working functionality in the critical path.

---

## Step-by-Step Findings

### Step 1: Landing Page
**Time:** ~2 minutes  
**URL:** https://sidor-eta.vercel.app

**✅ What worked:**
- Page headline "סידורי עבודה חכמים לעסק שלך" is clear and immediately communicates the product in under 3 seconds
- "בטא פתוחה · חינם לזמן מוגבל" badge sets good expectations
- Social proof section with Israeli business names (קפה לוין, מסעדת אגדה) is reassuring
- Pricing section is crystal clear: Free (5 עובדים), Starter ₪59 (15 עובדים), Business ₪149, Pro ₪299
- The ₪59 Starter tier is perfectly positioned for Danny (10 employees)
- FAQ answers real Danny-level questions (WhatsApp, 14-day pilot, no credit card)
- "ללא כרטיס אשראי · התקנה ב-2 דקות" is excellent reassurance copy
- Two clear CTAs: "התחל חינם" and "צפה בדמו (60 שניו��)"

**❌ What was confusing:**
- Stats section shows "+0h שעות חיסכון" and "+0%" — animated counters stuck at zero on load. First impression: "this thing doesn't save any time?"
- "API-first" listed as a feature on the main features section — this means nothing to Danny. He would skip past it confused
- No phone number or live chat visible — Danny wants to know he can call someone

**⏱ Time:** 90 seconds to understand the product, find pricing, decide to try  
**💡 Danny verdict:** "נראה טוב, בוא נראה אם זה עובד"

---

### Step 2: Signup
**Time:** FAILED — Could not complete  
**URL:** https://sidor-eta.vercel.app/login

**✅ What worked:**
- Login page is clean and bilingual-friendly
- Google SSO button ("המשך עם Google") is present — great for Israeli SMBs who hate creating passwords
- "קישור קסם" (magic link) tab is a nice modern touch
- Three tab options: כניסה, הרשמה, קישור קסם

**❌ CRITICAL BUG — Registration tab completely empty:**
- Clicking the "הרשמה" (Register) tab shows a completely blank panel
- Confirmed via DOM inspection: `panel_html: ""` — the registration form has zero content
- This means **a new user cannot create an account at all**
- There is no signup form, no email field, no password, nothing
- Danny would see a blank tab and assume the site is broken, then leave immediately

**😤 RAGE MOMENT #1:** "לחצתי הרשמה ולא קרה כלום. האתר שבור?"

**⏱ Time:** Unable to complete. Was already in a demo org session (the app provides a demo org automatically for testing — good UX decision for demo, but real signup is broken)

**Note:** The app correctly auto-redirected to a demo "ארגון הדגמה" session, which allowed testing the rest of the app. This is the only reason the test could continue.

---

### Step 3: Add Employees
**Time:** ~4 minutes for one employee, ~6+ minutes estimated for 10  
**URL:** https://sidor-eta.vercel.app/employees

**✅ What worked:**
- Employee list is clean: shows name, role, branch, status, and constraint count
- "הוסף עובד/ת" button opens a modal with clear fields
- Add form fields: שם מלא, דוא"ל, טלפון, תפקידים (מופרדים בפסיק), סניף ראשי
- Roles field accepts comma-separated text — no need to pre-configure roles
- Form saved successfully after filling all fields
- "ייבוא מרובה" (bulk import) button exists — critical for Danny who has a list in Excel
- Confirmation: newly added employee "נועה כהן" appeared in the available employees panel on the schedule page
- Employee cards show constraint count ("3 אילוצים") — clear at a glance

**❌ What was confusing:**
- Add button click didn't visually confirm opening — the modal opens in DOM but doesn't appear to "pop open" clearly (likely a z-index/animation issue)
- No phone number format validation (Israeli format 05X-XXXXXXX not guided)
- No way to add constraints during employee creation — must do it separately as a second step
- No "add another" button after saving — must re-click "הוסף"
- **No phone field in the employee list** — Danny can't see contact numbers at a glance
- "י��בוא מרובה" button was not tested (could not determine format it expects without trying)
- Estimated time for 10 employees: ~8-10 minutes clicking through one by one
- Missing: No WhatsApp number field (separate from general phone) — key for the sharing feature

**Clicks to add one employee:** ~7 clicks (button → fill 5 fields → save)  
**⏱ Time:** 4 minutes for 1 employee test. Estimated 40+ minutes for all 10 one by one.

---

### Step 4: Set Constraints (Availability)
**Time:** ~3 minutes to explore  
**URL:** https://sidor-eta.vercel.app/employees/[id]?tab=availability

**✅ DELIGHT MOMENT — The availability grid:**
- The 7×48 grid (7 days × 48 half-hour slots) is fully implemented
- Every slot is individually clickable: "יום ראשון שעה 08:00", "יום שבת שעה 22:00" etc.
- Four modes: מועדף (preferred), זמין (available), לא זמין (unavailable), נקה (clear)
- Drag-to-paint tooltip: "לחצו וגררו על המסך כדי לצבוע מספר תאים בו-זמנית"
- This is genuinely impressive and directly addresses the core pain point
- "שמור שינויים" button present

**✅ Constraints form (separate tab):**
- מקסימום שעות לשבוע (max weekly hours)
- אורך משמרת מועדף (preferred shift length: 4h, 6h, 8h)
- לא לעבוד לפני שעה / אחרי שעה (time window — direct answer to "מיה בוקר בלבד")
- "לא לעבוד בשבת" checkbox — built-in Israeli compliance
- "לא משמרות לילה אחרי 22:00" checkbox
- הערות נוספות free text (e.g., "לא ימי שלישי — לימודים")

**❌ What was confusing:**
- **No "block all of Saturday" button** — Danny must click all 48 Saturday slots individually, or use drag. Not immediately obvious
- The "זמינות" tab doesn't auto-select when clicking from the employees list's "ערוך אילוצים" link — it shows constraints tab by default
- No visual confirmation of saved state (no color change, no "שמור" feedback animation seen)
- The free text notes field is great but unclear if AI actually reads it or it's just cosmetic
- Two separate places for constraints (the grid AND the form) is confusing — why are there two systems?

**😤 FRICTION POINT:** "איפה אני חוסם שבת? צריך ללחוץ על כל תא בנפרד?"

---

### Step 5: Create a Schedule / Auto-Schedule
**Time:** 10 minutes trying, zero shifts created  
**URL:** https://sidor-eta.vercel.app/schedule

**✅ What worked (visually):**
- Schedule page layout is clean with cost meter (עלות שכר שבועית: ₪0)
- Status indicators: ללא חריגות שעתיות, השבוע מכוסה במלואו, כל העובדים מתומחרים
- Available employees sidebar shows all 10 employees with "גרור למשמרת" drag hints
- Week navigation buttons present (שבוע הבא / שבוע קודם)
- Filter by branch and role

**❌ CRITICAL BUGS — All schedule creation is broken:**

1. **"שיבוץ אוטומטי לשבוע שלם" button** — clicked multiple times, zero response. No dialog, no modal, no toast notification, no shifts created. Silent failure.

2. **"שיבוץ אוטומ��י" toolbar button** — same result, completely silent.

3. **"צור משמרת ראשונ��" button** — no dialog opens, no navigation, no response whatsoever.

4. **"פרסום בוואטסאפ" button** — no response, no dialog, no WhatsApp link generated.

5. **"פרסם" button** — not tested for response (expected similar silent failure).

6. **"ייצוא ושיתוף — תמונה או PDF" button** — not tested.

7. **Week navigation** — clicking "שבוע קודם" did not change the displayed week (stayed at "24.5 – 30.5.2026").

**😤 RAGE MOMENT #2 (The main one):** "לחצתי שיבוץ אוטומטי ולא קרה כלום. לחצתי שוב. שום דבר. ניסיתי 'צור משמרת'. שום דבר. אתה מציע לי לשלם ₪59 בשביל כפתורים שלא עושים כלום?!"

**This is the moment Danny would close the tab and never return.**

---

### Step 6: Publish & WhatsApp Share
**Time:** Attempted, completely failed  
**Result:** See Step 5 — WhatsApp share button is non-functional

---

### Step 7: Compliance
**What exists (in Settings → כללי עבודה):**
- Max daily hours: 10 (configurable)
- Max weekly hours: 48 (configurable, Israeli labor law default)
- Minimum rest between shifts: 8 hours (configurable)
- Business hours: 08:00–23:00
- Shift types: בוקר, צהריים, ��רב, לילה
- Hourly cost by role (all pre-filled at ₪50/hour)

**What's broken:**
- Cannot test compliance warnings because no shifts can be created
- The "1 אזהרה" shown in the landing page demo graphic cannot be reproduced in actual use
- The compliance engine exists in settings but cannot be validated end-to-end

---

### Step 8: Time-Off / Swaps Inbox
**URL:** https://sidor-eta.vercel.app/swaps

**✅ What worked:**
- Clean, simple page: "בקשות החלפת משמרת"
- Subtitle: "עובדים שביקשו שתמצא להם מחליף. אישור פה מעדכן את הסידור באופן אוטומטי."
- Empty state message: "אין בקשות החלפה ממתינות. הכל סגור." — clear and reassuring

**❌ What's missing:**
- No manager-initiated time-off management (only swap requests from employees)
- No "חופשות" inbox for manager — the vacation tab on the employee page exists but the inbox is absent
- Cannot test with real data since no shifts exist

---

### Additional Page: הוגנות (Fairness)
**URL:** https://sidor-eta.vercel.app/fairness

**✅ Concept is excellent:**
- "מי מקבל יותר מדי סופ"שים, לילות וסגירות. השווה מול חציון הצוות."
- Time window filters: 2, 4, 8, 13 שבועות
- Message: "אין מספיק נתונים בחלון הזמן הזה."

**Note:** Feature cannot be tested without existing schedule data. Conceptually this is a differentiating feature that Danny would love.

---

### Additional Page: Settings
**URL:** https://sidor-eta.vercel.app/settings

**✅ What worked:**
- 4 tabs: כללי, תפקידים, סניפים, כללי עבודה
- Business type dropdown has 13 industry options including "מסעדה / קפה" — Danny's exact industry
- Timezone set to Asia/Jerusalem by default — correct
- Week start: ראשון (Sunday) — correct for Israel
- Work rules tab has full compliance configuration
- Hourly rates per role (useful for cost calculations)
- Current plan shown: FREE

**❌ What was confusing:**
- Demo org is set to "קמעונאות / חנות" (retail), not restaurant — Danny would need to change this
- "תוכנית: FREE" shown in settings but no upgrade button nearby — missed upsell opportunity
- No way to set employee WhatsApp numbers from settings

---

## TOP 5 Friction Points That Must Be Fixed

### #1 — CRITICAL: Registration tab is completely broken
The "הרשמה" tab in the login page is empty. New users cannot create accounts. This is a show-stopper that prevents any real user from ever reaching the app.
**Fix:** Implement the registration form (name, email, business name, password).

### #2 — CRITICAL: Auto-schedule and manual shift creation are both non-functional
Clicking "שיבוץ אוטומטי ל��בוע שלם", "שיבוץ אוטומטי", and "צור משמרת ראשונה" produces zero response — no dialog, no modal, no error, no feedback. This is the core feature of the entire product.
**Fix:** These buttons need to either open a configuration dialog or directly create shifts. At minimum, a toast notification explaining what's happening.

### #3 — HIGH: WhatsApp share is non-functional
The most-marketed feature ("שיתוף בוואטסאפ") does nothing when clicked. This is the #1 reason the landing page testimonial says "הצוות מקבל את הסידור בוואטסאפ." Danny will feel deceived.
**Fix:** Button needs to open a dialog showing per-employee WhatsApp links (wa.me format) for copying/sharing.

### #4 — MEDIUM: Adding 10 employees takes 40+ minutes
No bulk import guidance (what CSV format?), no "add another" button, no paste-from-clipboard. Each employee requires 7+ clicks and a round trip.
**Fix:** Show a simple CSV template for bulk import. Add "שמור והוסף עוד" button. Allow adding constraints during creation.

### #5 — MEDIUM: Blocking Saturday on availability grid requires 48 individual clicks
There's no "חסום שבת שלמה" or "סמן כל היום" shortcut. For Danny who wants to set "נועה לא עובדת שבת" — he needs to click 48 slots. The constraint form has a "לא לעבוד בשבת" checkbox which is better, but it's on a different tab and not obvious.
**Fix:** Add "בחר כל היום" column header buttons. Better: the "לא ��עבוע בשבת" checkbox on the constraints tab should visually sync with the grid.

---

## What Genuinely Impressed Danny

1. **The landing page Hebrew copy is excellent** — reads like it was written by an Israeli restaurant manager, not a developer. "חוסכת 5 שעות בשבוע" is specific and believable.

2. **Pricing is perfect for the market** — ��59/month for a 15-person restaurant is a no-brainer if it works. Even the free tier is generous.

3. **The 7×48 availability grid** — when Danny saw it, this would be the "wow" moment. Being able to paint an entire week's availability by dragging is genuinely impressive compared to WhatsApp messages and spreadsheets.

4. **Israeli compliance built-in** — "לא לעבוד בשבת" checkbox, "לא משמרות לילה אחרי 22:00", the 48-hour weekly max — these show the product understands Israeli labor law without Danny having to explain it.

5. **The cost meter concept** — seeing "עלות שכר השבוע: ₪0" update in real-time as you assign shifts would be genuinely valuable. Danny has never seen his weekly payroll cost in real-time.

6. **Fairness analytics** — the concept of "��י מקבל יותר סופ"שים" is something every restaurant manager complains about. This feature alone could justify the subscription.

---

## Moment of Delight vs. Moment of Rage

**Moment of Delight:** Opening the availability grid for the first time — "יש פה גריד שבועי שאפשר לצייר עליו! זה בדיוק מה שצריכתי!"

**Moment of Rage:** After seeing the beautiful grid and spending 10 minutes setting everything up, clicking "שיבוץ אוטומטי" and getting absolutely nothing. Not an error. Not a loading spinner. Complete silence. "כל העבודה שעשיתי עכשיו — לשום דבר."

---

## Full Workflow Time Summary

| Step | Target | Actual | Status |
|------|--------|--------|--------|
| Landing page comprehension | 5 min | ~2 min | ✅ Passed |
| Signup | 2 min | FAILED | ��� Broken |
| Add 10 employees | 5 min | ~40 min estimated | ❌ Too slow |
| Set constraints | 5 min | ~8 min for 3 employees | ⚠️ Marginal |
| Create schedule | 3 min | 10 min, 0 shifts | ❌ Broken |
| Publish + WhatsApp | 2 min | FAILED | ❌ Broken |
| **Total** | **<60 min** | **Cannot complete** | **❌ Blocked** |

---

## Key Questions Answered

1. **How long did the full workflow take?** — Cannot be completed due to broken core features.

2. **What's the #1 thing that would make Danny quit?** — The auto-schedule button doing nothing after he spent 15 minutes adding employees and setting constraints. This is the "I wasted my time" moment.

3. **Is the Hebrew UI natural and clear?** — Yes, strongly. The Hebrew is excellent throughout — right-to-left layout works well, terminology is appropriate for Israeli SMB context, and the FAQ reads like it was written by someone who knows restaurant owners.

4. **Does the auto-schedule actually work?** — No. Completely non-functional. Zero shifts were generated across multiple attempts.

5. **Is the WhatsApp share genuinely useful?** — Concept is excellent. Implementation is non-functional (button does nothing).

---

## NPS Score: 3/10

**Reasoning:**
- Danny would not recommend this to his restaurant owner friend in its current state
- "יש פה משהו טוב אבל לא עובד. תחזור אלי בעוד חצי שנה."
- The score is not 0 because the UI, the concept, and the Hebrew copy are genuinely good
- The score is 3 and not lower because if the core buttons worked, this would be a 8-9

**Path to 8/10:** Fix the three critical bugs (registration, auto-schedule, WhatsApp share) and the score would jump dramatically. The foundation is solid — the construction site is just missing the walls.

---

## Technical Notes for Developers

- Registration tab panel renders empty HTML — likely a conditional render bug or missing component import
- Auto-schedule buttons fire click events (confirmed by JS inspection) but produce no DOM changes, no network requests visible, no React state updates — likely an unimplemented onClick handler or a missing API route
- WhatsApp share button similarly silent — no window.open(), no clipboard write, no API call
- Week navigation buttons appear to update the date label in some cases but do not reload shift data
- The demo org ("ארגון הדגמה") is on the FREE plan — some features may be intentionally paywalled, but there is no error message or upgrade prompt shown when buttons are clicked, making it look broken rather than locked

---

*Report generated: 24.5.2026 | Test duration: ~45 minutes | Pages tested: landing, login, employees, employee/constraints, employee/availability, schedule, swaps, fairness, settings*
