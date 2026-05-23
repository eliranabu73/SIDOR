/**
 * Built-in schedule templates.
 * Pure data — no DB needed. Applied via POST /v1/templates/:id/apply
 * which creates roles + shifts for the current week.
 */

export interface TemplateShift {
  name: string;        // "משמרת בוקר"
  startTime: string;   // "08:00"
  endTime: string;     // "16:00"
  role: string;        // must match one of template.roles
  daysOfWeek: number[]; // 0=Sun … 6=Sat
}

export interface ScheduleTemplate {
  id: string;
  name: string;         // "מסעדה / קפה"
  description: string;
  emoji: string;
  industry: string;     // free text stored on org
  roles: string[];
  shifts: TemplateShift[];
  weeklyHours: number;  // estimated total weekly hours (for display)
  color: string;        // tailwind gradient hint, e.g. "from-orange-500 to-red-500"
}

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'restaurant',
    name: 'מסעדה / קפה',
    description: '3 משמרות ביום, 7 ימים. מושלם לעסקי אוכל ובתי קפה.',
    emoji: '🍽️',
    industry: 'restaurant',
    color: 'from-orange-500 to-red-500',
    weeklyHours: 126,
    roles: ['מנהל', 'מלצר', 'טבח', 'קופאי'],
    shifts: [
      { name: 'בוקר',  startTime: '08:00', endTime: '15:00', role: 'מלצר',  daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'צהריים',startTime: '11:00', endTime: '18:00', role: 'טבח',   daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ערב',   startTime: '16:00', endTime: '23:00', role: 'מלצר',  daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ניהול', startTime: '09:00', endTime: '17:00', role: 'מנהל',  daysOfWeek: [0,1,2,3,4]     },
    ],
  },
  {
    id: 'retail',
    name: 'חנות / קמעונאות',
    description: '2 משמרות ביום, ראשון–שישי. מתאים לחנויות ומרכזי קניות.',
    emoji: '🛍️',
    industry: 'retail',
    color: 'from-blue-500 to-cyan-500',
    weeklyHours: 72,
    roles: ['מנהל', 'מוכר', 'קופאי'],
    shifts: [
      { name: 'בוקר',  startTime: '09:00', endTime: '15:00', role: 'מוכר',  daysOfWeek: [0,1,2,3,4,5] },
      { name: 'אחה"צ', startTime: '14:00', endTime: '21:00', role: 'מוכר',  daysOfWeek: [0,1,2,3,4,5] },
      { name: 'ניהול', startTime: '09:00', endTime: '17:00', role: 'מנהל',  daysOfWeek: [0,1,2,3,4]   },
    ],
  },
  {
    id: 'clothing-store',
    name: 'חנות בגדים',
    description: '2 משמרות ביום, ראשון–שישי + שבת. מותאם לרשתות אופנה וחנויות בוטיק.',
    emoji: '👗',
    industry: 'retail',
    color: 'from-pink-500 to-rose-500',
    weeklyHours: 84,
    roles: ['מנהל חנות', 'יועץ מכירות', 'קופאי/ת'],
    shifts: [
      { name: 'בוקר',  startTime: '09:30', endTime: '15:30', role: 'יועץ מכירות', daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'אחה"צ', startTime: '14:30', endTime: '21:30', role: 'יועץ מכירות', daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ניהול', startTime: '09:00', endTime: '17:00', role: 'מנהל חנות',   daysOfWeek: [0,1,2,3,4]    },
    ],
  },
  {
    id: 'pharmacy',
    name: 'פארם / בית מרקחת',
    description: '2 משמרות ביום, ראשון–שישי. לבתי מרקחת, רשתות פארמה ומרכזי בריאות.',
    emoji: '💊',
    industry: 'pharmacy',
    color: 'from-emerald-500 to-teal-500',
    weeklyHours: 60,
    roles: ['רוקח/ת', 'עוזר/ת רוקח', 'קופאי/ת', 'מנהל/ת סניף'],
    shifts: [
      { name: 'בוקר',  startTime: '08:00', endTime: '14:00', role: 'רוקח/ת',        daysOfWeek: [0,1,2,3,4,5] },
      { name: 'אחה"צ', startTime: '13:00', endTime: '20:00', role: 'רוקח/ת',        daysOfWeek: [0,1,2,3,4,5] },
      { name: 'בוקר',  startTime: '08:00', endTime: '14:00', role: 'עוזר/ת רוקח',  daysOfWeek: [0,1,2,3,4,5] },
      { name: 'ניהול', startTime: '08:30', endTime: '16:30', role: 'מנהל/ת סניף',  daysOfWeek: [0,1,2,3,4]   },
    ],
  },
  {
    id: 'clinic',
    name: 'מרפאה / קליניקה',
    description: '2 משמרות ביום, ראשון–חמישי. לרפואה, פיזיוטרפיה, קוסמטיקה.',
    emoji: '🏥',
    industry: 'clinic',
    color: 'from-green-500 to-teal-500',
    weeklyHours: 50,
    roles: ['רופא', 'אחות', 'פקידת קבלה'],
    shifts: [
      { name: 'בוקר',  startTime: '08:00', endTime: '13:00', role: 'אחות',          daysOfWeek: [0,1,2,3,4] },
      { name: 'אחה"צ', startTime: '13:00', endTime: '19:00', role: 'אחות',          daysOfWeek: [0,1,2,3,4] },
      { name: 'קבלה',  startTime: '08:00', endTime: '18:00', role: 'פקידת קבלה',   daysOfWeek: [0,1,2,3,4] },
    ],
  },
  {
    id: 'hotel',
    name: 'מלון / אירוח',
    description: '3 משמרות 24/7 כולל לילה. מתאים למלונות, דירות נופש, מוסדות.',
    emoji: '🏨',
    industry: 'hotel',
    color: 'from-purple-500 to-indigo-500',
    weeklyHours: 168,
    roles: ['מנהל', 'קבלן', 'חדרים', 'אבטחה'],
    shifts: [
      { name: 'בוקר',  startTime: '07:00', endTime: '15:00', role: 'קבלן',   daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ערב',   startTime: '15:00', endTime: '23:00', role: 'קבלן',   daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'לילה',  startTime: '23:00', endTime: '07:00', role: 'אבטחה',  daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'חדרים', startTime: '08:00', endTime: '16:00', role: 'חדרים',  daysOfWeek: [0,1,2,3,4,5,6] },
    ],
  },
  {
    id: 'security',
    name: 'אבטחה / שמירה',
    description: '3 משמרות 24/7. לחברות אבטחה, מבנים, אתרי בנייה.',
    emoji: '🛡️',
    industry: 'security',
    color: 'from-slate-600 to-slate-800',
    weeklyHours: 168,
    roles: ['מאבטח', 'קצין', 'מוקדן'],
    shifts: [
      { name: 'א׳',   startTime: '06:00', endTime: '14:00', role: 'מאבטח',  daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ב׳',   startTime: '14:00', endTime: '22:00', role: 'מאבטח',  daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ג׳',   startTime: '22:00', endTime: '06:00', role: 'מאבטח',  daysOfWeek: [0,1,2,3,4,5,6] },
    ],
  },
  {
    id: 'warehouse',
    name: 'מחסן / לוגיסטיקה',
    description: '2 משמרות ביום, ראשון–שישי. לעסקי הפצה, מחסנים, ייצור.',
    emoji: '🏭',
    industry: 'warehouse',
    color: 'from-yellow-500 to-orange-500',
    weeklyHours: 96,
    roles: ['מנהל מחסן', 'מחסנאי', 'נהג'],
    shifts: [
      { name: 'בוקר',  startTime: '06:00', endTime: '14:00', role: 'מחסנאי',      daysOfWeek: [0,1,2,3,4,5] },
      { name: 'אחה"צ', startTime: '14:00', endTime: '22:00', role: 'מחסנאי',      daysOfWeek: [0,1,2,3,4,5] },
      { name: 'ניהול', startTime: '07:00', endTime: '16:00', role: 'מנהל מחסן',   daysOfWeek: [0,1,2,3,4]   },
    ],
  },
  {
    id: 'kindergarten',
    name: 'גן ילדים / צהרון',
    description: '2 משמרות ביום, ראשון–שישי. לגני ילדים, צהרונים ומרכזי יום.',
    emoji: '🧒',
    industry: 'kindergarten',
    color: 'from-yellow-400 to-amber-500',
    weeklyHours: 66,
    roles: ['גננת', 'סייעת', 'אחראי/ת צהרון'],
    shifts: [
      { name: 'בוקר',  startTime: '07:00', endTime: '14:00', role: 'גננת',         daysOfWeek: [0,1,2,3,4,5] },
      { name: 'צהרון', startTime: '14:00', endTime: '18:00', role: 'אחראי/ת צהרון', daysOfWeek: [0,1,2,3,4,5] },
      { name: 'סיוע',  startTime: '07:30', endTime: '13:30', role: 'סייעת',         daysOfWeek: [0,1,2,3,4,5] },
    ],
  },
  {
    id: 'school',
    name: 'בית ספר / אקדמיה',
    description: '2 משמרות ביום, ראשון–שישי. לבתי ספר, מכללות ומכוני לימוד.',
    emoji: '📚',
    industry: 'school',
    color: 'from-blue-400 to-indigo-500',
    weeklyHours: 54,
    roles: ['מורה', 'מחנך/ת', 'מזכיר/ת'],
    shifts: [
      { name: 'בוקר',   startTime: '07:30', endTime: '14:30', role: 'מורה',    daysOfWeek: [0,1,2,3,4,5] },
      { name: 'מנהלה',  startTime: '08:00', endTime: '16:00', role: 'מזכיר/ת', daysOfWeek: [0,1,2,3,4]   },
      { name: 'חינוך',  startTime: '07:30', endTime: '14:30', role: 'מחנך/ת',  daysOfWeek: [0,1,2,3,4]   },
    ],
  },
  {
    id: 'homecare',
    name: 'שירותי בית / סיעוד',
    description: '3 משמרות 24/7. לסיעוד, שירותי בית, מעונות ומרכזי שיקום.',
    emoji: '🏠',
    industry: 'homecare',
    color: 'from-teal-400 to-green-500',
    weeklyHours: 168,
    roles: ['מטפל/ת', 'אחות', 'רכז/ת טיפול'],
    shifts: [
      { name: 'בוקר',  startTime: '07:00', endTime: '15:00', role: 'מטפל/ת',      daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ערב',   startTime: '15:00', endTime: '23:00', role: 'מטפל/ת',      daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'לילה',  startTime: '23:00', endTime: '07:00', role: 'אחות',         daysOfWeek: [0,1,2,3,4,5,6] },
      { name: 'ניהול', startTime: '08:00', endTime: '16:00', role: 'רכז/ת טיפול', daysOfWeek: [0,1,2,3,4]     },
    ],
  },
  {
    id: 'events',
    name: 'אירועים / קייטרינג',
    description: 'משמרות ערב וסוף שבוע. לחברות אירועים, קייטרינג ואולמות.',
    emoji: '🎉',
    industry: 'events',
    color: 'from-fuchsia-500 to-pink-500',
    weeklyHours: 70,
    roles: ['מנהל אירוע', 'מלצר/ית', 'טבח', 'ברמן/ית'],
    shifts: [
      { name: 'הכנה', startTime: '10:00', endTime: '16:00', role: 'טבח',        daysOfWeek: [4,5,6] },
      { name: 'ערב',  startTime: '16:00', endTime: '24:00', role: 'מלצר/ית',    daysOfWeek: [4,5,6] },
      { name: 'בר',   startTime: '18:00', endTime: '24:00', role: 'ברמן/ית',    daysOfWeek: [4,5,6] },
      { name: 'ניהול',startTime: '12:00', endTime: '24:00', role: 'מנהל אירוע', daysOfWeek: [5,6]   },
    ],
  },
  {
    id: 'garage',
    name: 'מוסך / שירות רכב',
    description: '2 משמרות ביום, ראשון–שישי. למוסכים, שירות רכב ומרכזי טסט.',
    emoji: '🔧',
    industry: 'garage',
    color: 'from-zinc-600 to-slate-700',
    weeklyHours: 72,
    roles: ['מכונאי/ת', 'פחחי/ת', 'חשמלאי/ת רכב', 'מוקדן/ית'],
    shifts: [
      { name: 'בוקר',  startTime: '08:00', endTime: '14:00', role: 'מכונאי/ת',      daysOfWeek: [0,1,2,3,4,5] },
      { name: 'אחה"צ', startTime: '14:00', endTime: '20:00', role: 'מכונאי/ת',      daysOfWeek: [0,1,2,3,4,5] },
      { name: 'בוקר',  startTime: '08:00', endTime: '14:00', role: 'פחחי/ת',        daysOfWeek: [0,1,2,3,4]   },
      { name: 'קבלה',  startTime: '08:00', endTime: '17:00', role: 'מוקדן/ית',      daysOfWeek: [0,1,2,3,4,5] },
    ],
  },
];

export function getTemplate(id: string): ScheduleTemplate | undefined {
  return SCHEDULE_TEMPLATES.find((t) => t.id === id);
}
