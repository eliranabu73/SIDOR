import bidiFactory from 'bidi-js';
import {
  buildScheduleTemplate,
  groupShiftsByDay,
  roleColor,
} from '../../src/modules/share/export/templates/satori-template';
import type {
  ScheduleExportData,
  ExportShiftRow,
  ExportStyle,
} from '../../src/modules/share/export/types';

// ===========================================================================
// satori.matrix.test.ts
// ---------------------------------------------------------------------------
// Broad table-driven (it.each / describe.each) coverage of the satori export
// template: roleColor hash determinism + palette membership, formatHm timezone
// grid (via rendered shift times), groupShiftsByDay local-day bucketing across
// timezones, null-role-LAST ordering, theme/style structural matrix, and vis()
// RTL determinism. Every expectation is a HAND-COMPUTED literal verified once
// against luxon / bidi-js (see comments) — never recomputed by the source.
// All calendar dates are FIXED (summer week 2026-06-07 Sun, winter 2026-01-15).
// ===========================================================================

// ---------------------------------------------------------------------------
// Local re-implementations of the template's private helpers, so expected
// values are derived INDEPENDENTLY of the source under test (no tautology).
// ---------------------------------------------------------------------------

const _bidi = bidiFactory();
function vis(str: string): string {
  if (!str) return str;
  const levels = _bidi.getEmbeddingLevels(str, 'rtl');
  return _bidi.getReorderedString(str, levels);
}

// The fixed 8-colour palette, duplicated here (source does not export it).
const ROLE_HEXES = [
  '#6366f1', // 0
  '#10b981', // 1
  '#f43f5e', // 2
  '#f59e0b', // 3
  '#0ea5e9', // 4
  '#d946ef', // 5
  '#06b6d4', // 6
  '#84cc16', // 7
] as const;

// ---------------------------------------------------------------------------
// Tree-walk helpers (collect text nodes / style objects from a React element).
// ---------------------------------------------------------------------------

function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const children = (node as { props?: { children?: unknown } }).props?.children;
  if (Array.isArray(children)) {
    for (const c of children) collectText(c, acc);
  } else if (children != null) {
    collectText(children, acc);
  }
  return acc;
}

function collectStyles(
  node: unknown,
  acc: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (node == null || typeof node !== 'object') return acc;
  const props = (node as { props?: { style?: unknown; children?: unknown } }).props;
  if (props?.style && typeof props.style === 'object') {
    acc.push(props.style as Record<string, unknown>);
  }
  const children = props?.children;
  if (Array.isArray(children)) {
    for (const c of children) collectStyles(c, acc);
  } else if (children != null) {
    collectStyles(children, acc);
  }
  return acc;
}

function shift(
  partial: Partial<ExportShiftRow> &
    Pick<ExportShiftRow, 'id' | 'startsAt' | 'endsAt'>,
): ExportShiftRow {
  return {
    role: null,
    location: null,
    employeeNames: [],
    requiredCount: 1,
    ...partial,
  };
}

function makeData(
  shifts: ExportShiftRow[],
  overrides: Partial<ScheduleExportData> = {},
): ScheduleExportData {
  return {
    orgName: 'מסעדה',
    orgLogoDataUrl: null,
    weekStart: '2026-06-07', // a Sunday (summer week, Asia/Jerusalem = UTC+3 IDT)
    weekEnd: '2026-06-13',
    scheduleId: 'sched_test',
    shifts,
    employees: [],
    ...overrides,
  };
}

// ===========================================================================
// 1. roleColor — hash formula spot-checks (HAND-COMPUTED palette index)
// ===========================================================================
// Each [role, expectedIndex] pair was computed once via the documented
// formula h=(h*31+charCode)>>>0 then h%8, and the index frozen as a literal.
// The test maps index -> ROLE_HEXES[index] for the expected colour. Index is
// the load-bearing literal; it does NOT call the source hash to derive itself.

describe('roleColor — frozen hash index table', () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['קופה', 6],
    ['מלצרות', 5],
    ['מטבח', 0],
    ['ניהול', 2],
    ['שטיפה', 2],
    ['בר', 7],
    ['משלוחים', 7],
    ['אבטחה', 4],
    ['תפעול', 7],
    ['מארחת', 1],
    ['ברמן', 0],
    ['טבח', 6],
    ['שליח', 1],
    ['מנהל', 2],
    ['עוזר', 5],
    ['קצב', 2],
    ['אופה', 5],
    ['דיילת', 1],
    ['נהג', 6],
    ['מאבטח', 6],
    ['A', 1], // 65 % 8 = 1
    ['B', 2], // 66 % 8 = 2
    ['C', 3], // 67 % 8 = 3
    ['x', 0], // 120 % 8 = 0
    ['kitchen', 4],
    ['bar', 3],
    ['manager', 5],
    ['waiter', 2],
    ['host', 0],
    ['cook', 0],
    ['a', 1], // 97 % 8 = 1
    ['ab', 1],
    ['abc', 2],
    ['abcd', 2],
  ];

  it.each(cases)('roleColor(%j) -> palette[%i]', (role, idx) => {
    expect(roleColor(role, '#fallback')).toBe(ROLE_HEXES[idx]!);
  });

  it.each(cases)(
    'roleColor(%j) ignores the fallback and stays in the palette',
    (role) => {
      // Two different fallbacks must yield the SAME palette colour for a
      // non-null role (fallback is only used on null).
      const a = roleColor(role, '#aaaaaa');
      const b = roleColor(role, '#bbbbbb');
      expect(a).toBe(b);
      expect(ROLE_HEXES as readonly string[]).toContain(a);
    },
  );

  it.each(cases)('roleColor(%j) is deterministic across repeated calls', (role) => {
    expect(roleColor(role, '#f')).toBe(roleColor(role, '#f'));
  });
});

// roleColor null / empty fallback table.
describe('roleColor — null & empty roles fall back', () => {
  const fallbacks: ReadonlyArray<readonly [string | null, string]> = [
    [null, '#abcdef'],
    [null, '#000000'],
    [null, 'red'],
    [null, '#22d3ee'],
    ['', '#fb0000'], // empty string is falsy -> fallback path
    ['', 'rgba(0,0,0,1)'],
  ];
  it.each(fallbacks)(
    'roleColor(%j, %j) returns the fallback verbatim',
    (role, fb) => {
      expect(roleColor(role, fb)).toBe(fb);
    },
  );
});

// Single-character ASCII roles: for one char, h = charCode, so index = code%8.
describe('roleColor — single ASCII char maps to charCode % 8', () => {
  // [char, charCode, expectedIndex] — charCode and index are literals.
  const cases: ReadonlyArray<readonly [string, number, number]> = [
    ['A', 65, 1],
    ['B', 66, 2],
    ['C', 67, 3],
    ['D', 68, 4],
    ['E', 69, 5],
    ['F', 70, 6],
    ['G', 71, 7],
    ['H', 72, 0],
    ['I', 73, 1],
    ['Z', 90, 2],
    ['a', 97, 1],
    ['b', 98, 2],
    ['0', 48, 0],
    ['1', 49, 1],
    ['9', 57, 1],
  ];
  it.each(cases)(
    'roleColor(%j) [code %i] -> palette[%i]',
    (ch, code, idx) => {
      // sanity: the literal charCode matches the actual char.
      expect(ch.charCodeAt(0)).toBe(code);
      // sanity: index is code % 8 (arithmetic in the table).
      expect(code % 8).toBe(idx);
      expect(roleColor(ch, '#fb')).toBe(ROLE_HEXES[idx]!);
    },
  );
});

// ===========================================================================
// 2. formatHm — timezone grid, asserted through rendered shift time strings.
// ===========================================================================
// The template renders "HH:mm–HH:mm" per shift using formatHm(iso, tz). We
// drive one shift through buildScheduleTemplate and assert the exact local
// string. Each expected string was computed once via luxon and frozen:
//   Asia/Jerusalem summer (Jun) = UTC+3, winter (Jan) = UTC+2
//   America/New_York  summer (Jun) = UTC-4, winter (Jan) = UTC-5
//   UTC / undefined tz = no offset
// Day bucketing is incidental here; the shift lands in some column and its
// time string appears in the tree exactly once.

describe('formatHm — local HH:mm grid via rendered times', () => {
  // [label, startIso, endIso, tz|undefined, weekStart, expectedTimeRange]
  const cases: ReadonlyArray<
    readonly [string, string, string, string | undefined, string, string]
  > = [
    // --- UTC / no timezone (legacy fallback) ---
    ['utc-explicit', '2026-06-07T08:00:00.000Z', '2026-06-07T15:00:00.000Z', 'UTC', '2026-06-07', '08:00–15:00'],
    ['utc-undefined', '2026-06-07T08:00:00.000Z', '2026-06-07T15:00:00.000Z', undefined, '2026-06-07', '08:00–15:00'],
    ['utc-midnight', '2026-06-07T00:00:00.000Z', '2026-06-07T00:30:00.000Z', 'UTC', '2026-06-07', '00:00–00:30'],
    ['utc-late', '2026-06-07T23:15:00.000Z', '2026-06-07T23:45:00.000Z', 'UTC', '2026-06-07', '23:15–23:45'],
    // --- Asia/Jerusalem summer (UTC+3) ---
    ['jer-summer-morning', '2026-06-09T07:05:00.000Z', '2026-06-09T19:30:00.000Z', 'Asia/Jerusalem', '2026-06-07', '10:05–22:30'],
    ['jer-summer-noon', '2026-06-09T09:00:00.000Z', '2026-06-09T13:00:00.000Z', 'Asia/Jerusalem', '2026-06-07', '12:00–16:00'],
    ['jer-summer-am', '2026-06-09T05:00:00.000Z', '2026-06-09T08:00:00.000Z', 'Asia/Jerusalem', '2026-06-07', '08:00–11:00'],
    // --- Asia/Jerusalem winter (UTC+2), winter week starting 2026-01-11 (Sun) ---
    ['jer-winter-morning', '2026-01-15T07:05:00.000Z', '2026-01-15T15:00:00.000Z', 'Asia/Jerusalem', '2026-01-11', '09:05–17:00'],
    ['jer-winter-noon', '2026-01-15T10:00:00.000Z', '2026-01-15T14:30:00.000Z', 'Asia/Jerusalem', '2026-01-11', '12:00–16:30'],
    // --- America/New_York summer (UTC-4) ---
    ['ny-summer-noon', '2026-06-09T12:00:00.000Z', '2026-06-09T20:00:00.000Z', 'America/New_York', '2026-06-07', '08:00–16:00'],
    ['ny-summer-eve', '2026-06-09T22:00:00.000Z', '2026-06-09T23:30:00.000Z', 'America/New_York', '2026-06-07', '18:00–19:30'],
    // --- America/New_York winter (UTC-5) ---
    ['ny-winter-noon', '2026-01-15T12:00:00.000Z', '2026-01-15T18:00:00.000Z', 'America/New_York', '2026-01-11', '07:00–13:00'],
    ['ny-winter-am', '2026-01-15T13:30:00.000Z', '2026-01-15T17:45:00.000Z', 'America/New_York', '2026-01-11', '08:30–12:45'],
  ];

  it.each(cases)(
    'renders %s as %s',
    (_label, startsAt, endsAt, timezone, weekStart, expected) => {
      const data = makeData(
        [shift({ id: 's', startsAt, endsAt, timezone, role: 'מטבח' })],
        { weekStart },
      );
      const texts = collectText(buildScheduleTemplate(data, 'minimal'));
      expect(texts).toContain(expected);
    },
  );

  it.each(cases)(
    'does NOT render the raw UTC range for %s when tz shifts it',
    (_label, startsAt, endsAt, timezone, weekStart, expected) => {
      // Build the raw "HHZ:mm–HHZ:mm" the UTC clock would show; if the tz
      // moves the local time, that raw string must be absent.
      const rawStart = startsAt.slice(11, 16);
      const rawEnd = endsAt.slice(11, 16);
      const raw = `${rawStart}–${rawEnd}`;
      const data = makeData(
        [shift({ id: 's', startsAt, endsAt, timezone, role: 'מטבח' })],
        { weekStart },
      );
      const texts = collectText(buildScheduleTemplate(data, 'minimal'));
      if (raw !== expected) {
        expect(texts).not.toContain(raw);
      }
      expect(texts).toContain(expected);
    },
  );
});

// ===========================================================================
// 3. groupShiftsByDay — local-day bucketing grid across timezones.
// ===========================================================================
// Summer week starts Sunday 2026-06-07 (Asia/Jerusalem = UTC+3 IDT).
// Each [label, startIso, tz|undefined, expectedDayIdx|-1] frozen by hand.
// -1 means dropped (outside the 0..6 window).

describe('groupShiftsByDay — local day index grid (summer week 2026-06-07)', () => {
  const weekStart = '2026-06-07';
  // [label, startIso, tz, expectedDayIdx (-1 = dropped)]
  const cases: ReadonlyArray<
    readonly [string, string, string | undefined, number]
  > = [
    // UTC / no tz
    ['utc-sun-08', '2026-06-07T08:00:00.000Z', 'UTC', 0],
    ['utc-sun-0000', '2026-06-07T00:00:00.000Z', 'UTC', 0],
    ['utc-mon', '2026-06-08T09:00:00.000Z', undefined, 1],
    ['utc-tue', '2026-06-09T09:00:00.000Z', 'UTC', 2],
    ['utc-wed', '2026-06-10T09:00:00.000Z', 'UTC', 3],
    ['utc-thu', '2026-06-11T09:00:00.000Z', 'UTC', 4],
    ['utc-fri', '2026-06-12T09:00:00.000Z', 'UTC', 5],
    ['utc-sat', '2026-06-13T10:00:00.000Z', 'UTC', 6],
    ['utc-sat-2359', '2026-06-13T23:59:00.000Z', 'UTC', 6],
    ['utc-before', '2026-06-06T23:59:00.000Z', 'UTC', -1],
    ['utc-after', '2026-06-14T08:00:00.000Z', 'UTC', -1],
    // Asia/Jerusalem (UTC+3): 22:30Z Sun -> 01:30 Mon local => day 1.
    ['jer-latenight', '2026-06-07T22:30:00.000Z', 'Asia/Jerusalem', 1],
    // 21:30Z Sun -> 00:30 Mon local => day 1 (just crosses midnight).
    ['jer-cross-midnight', '2026-06-07T21:30:00.000Z', 'Asia/Jerusalem', 1],
    // 20:30Z Sun -> 23:30 Sun local => still day 0.
    ['jer-late-evening', '2026-06-07T20:30:00.000Z', 'Asia/Jerusalem', 0],
    // 16:00Z Sun -> 19:00 Sun local => day 0.
    ['jer-evening', '2026-06-07T16:00:00.000Z', 'Asia/Jerusalem', 0],
    // Sat 22:30Z -> Sun 01:30 local => day 7 -> dropped.
    ['jer-sat-overflow', '2026-06-13T22:30:00.000Z', 'Asia/Jerusalem', -1],
    // 06-06 22:30Z -> Sun 01:30 local => day 0 (pulled INTO the week).
    ['jer-pulled-in', '2026-06-06T22:30:00.000Z', 'Asia/Jerusalem', 0],
    // America/New_York (UTC-4 summer): Sun 02:00Z -> Sat 22:00 local => day -1.
    ['ny-pre-dawn', '2026-06-07T02:00:00.000Z', 'America/New_York', -1],
    // Mon 02:00Z -> Sun 22:00 local => day 0.
    ['ny-mon-becomes-sun', '2026-06-08T02:00:00.000Z', 'America/New_York', 0],
    // Sun 12:00Z -> Sun 08:00 local => day 0.
    ['ny-sun-noon', '2026-06-07T12:00:00.000Z', 'America/New_York', 0],
  ];

  it.each(cases)(
    'buckets %s into day %i',
    (id, startsAt, timezone, expectedIdx) => {
      const s = shift({
        id,
        startsAt,
        endsAt: '2026-06-14T02:00:00.000Z',
        timezone,
        role: 'אבטחה',
      });
      const buckets = groupShiftsByDay([s], weekStart);
      expect(buckets).toHaveLength(7);
      if (expectedIdx === -1) {
        expect(buckets.flat().map((x) => x.id)).toEqual([]);
      } else {
        expect(buckets[expectedIdx]!.map((x) => x.id)).toEqual([id]);
        // exactly one bucket holds it
        expect(buckets.flat()).toHaveLength(1);
      }
    },
  );
});

// ===========================================================================
// 4. groupShiftsByDay — intra-day ordering: role (he-collation) then time,
//    null-role LAST.
// ===========================================================================
// Hebrew collation order spot-checks (he locale, frozen by inspection):
//   מטבח < מלצרות  (ט < ל)
//   קופה < תפעול   (ק < ת)
// null sentinel always sorts AFTER any role.

describe('groupShiftsByDay — intra-day order table', () => {
  const weekStart = '2026-06-07';
  type Spec = { id: string; t: string; role: string | null };
  // [label, inputSpecs, expectedIdOrder]
  const cases: ReadonlyArray<readonly [string, Spec[], string[]]> = [
    [
      'role-then-time: מטבח before מלצרות',
      [
        { id: 'late-waiter', t: '18:00', role: 'מלצרות' },
        { id: 'kitchen', t: '09:00', role: 'מטבח' },
        { id: 'early-waiter', t: '08:00', role: 'מלצרות' },
      ],
      ['kitchen', 'early-waiter', 'late-waiter'],
    ],
    [
      'null role sorts last after one role',
      [
        { id: 'noRole', t: '08:00', role: null },
        { id: 'kupa', t: '07:00', role: 'קופה' },
      ],
      ['kupa', 'noRole'],
    ],
    [
      'null role sorts last after two roles (קופה < תפעול, null last)',
      [
        { id: 'nullX', t: '06:00', role: null },
        { id: 'tafol', t: '07:00', role: 'תפעול' },
        { id: 'kupa', t: '08:00', role: 'קופה' },
      ],
      ['kupa', 'tafol', 'nullX'],
    ],
    [
      'same role pure time sort',
      [
        { id: 'c', t: '15:00', role: 'בר' },
        { id: 'a', t: '08:00', role: 'בר' },
        { id: 'b', t: '12:00', role: 'בר' },
      ],
      ['a', 'b', 'c'],
    ],
    [
      'all null roles -> stable by time',
      [
        { id: 'n2', t: '14:00', role: null },
        { id: 'n1', t: '06:00', role: null },
        { id: 'n3', t: '20:00', role: null },
      ],
      ['n1', 'n2', 'n3'],
    ],
    [
      'two roles interleaved by time collapse to role groups',
      [
        { id: 'w2', t: '20:00', role: 'מלצרות' },
        { id: 'k2', t: '19:00', role: 'מטבח' },
        { id: 'w1', t: '07:00', role: 'מלצרות' },
        { id: 'k1', t: '06:00', role: 'מטבח' },
      ],
      ['k1', 'k2', 'w1', 'w2'],
    ],
  ];

  it.each(cases)('%s', (_label, specs, expectedOrder) => {
    const shifts = specs.map((sp) =>
      shift({
        id: sp.id,
        startsAt: `2026-06-07T${sp.t}:00.000Z`,
        endsAt: `2026-06-07T23:59:00.000Z`,
        role: sp.role,
      }),
    );
    const day0 = groupShiftsByDay(shifts, weekStart)[0]!;
    expect(day0.map((s) => s.id)).toEqual(expectedOrder);
    // null-role shift (if any) must be the very last element.
    const hasNull = specs.some((sp) => sp.role === null);
    const onlyNulls = specs.every((sp) => sp.role === null);
    if (hasNull && !onlyNulls) {
      expect(day0[day0.length - 1]!.role).toBeNull();
    }
  });

  it('is order-independent for the role-then-time case', () => {
    const specs: Spec[] = [
      { id: 'late-waiter', t: '18:00', role: 'מלצרות' },
      { id: 'kitchen', t: '09:00', role: 'מטבח' },
      { id: 'early-waiter', t: '08:00', role: 'מלצרות' },
    ];
    const mk = (arr: Spec[]) =>
      groupShiftsByDay(
        arr.map((sp) =>
          shift({
            id: sp.id,
            startsAt: `2026-06-07T${sp.t}:00.000Z`,
            endsAt: '2026-06-07T23:59:00.000Z',
            role: sp.role,
          }),
        ),
        weekStart,
      )[0]!.map((s) => s.id);
    expect(mk(specs)).toEqual(mk([...specs].reverse()));
  });
});

// ===========================================================================
// 5. Theme / style structural matrix.
// ===========================================================================
// Frozen theme tokens lifted from the source THEMES map. We assert the root
// element's background, plus fixed canvas dimensions, per style.

describe('theme/style matrix — root background & canvas', () => {
  // [style, expectedRootBg]
  const cases: ReadonlyArray<readonly [ExportStyle, string]> = [
    ['minimal', '#ffffff'],
    ['branded', '#f8fafc'],
    ['dark', '#020617'],
  ];
  it.each(cases)('style %s -> root background %s', (style, bg) => {
    const tree = buildScheduleTemplate(makeData([]), style);
    const rootStyle = (tree.props as { style: Record<string, unknown> }).style;
    expect(rootStyle.background).toBe(bg);
    // Fixed 1200x675 canvas regardless of style.
    expect(rootStyle.width).toBe(1200);
    expect(rootStyle.height).toBe(675);
    expect(rootStyle.fontFamily).toBe('Heebo, system-ui, sans-serif');
  });

  it.each(cases)('style %s renders 7 day columns', (style) => {
    const children = (
      buildScheduleTemplate(makeData([]), style).props as { children: unknown[] }
    ).children;
    const grid = children[1] as { props: { children: unknown[] } };
    expect(grid.props.children).toHaveLength(7);
  });

  // Per-style day-header background token (frozen from THEMES).
  const dayHeaderBg: ReadonlyArray<readonly [ExportStyle, string]> = [
    ['minimal', '#f1f5f9'],
    ['branded', '#eef2ff'],
    ['dark', '#1e293b'],
  ];
  it.each(dayHeaderBg)('style %s uses day-header bg %s somewhere', (style, bg) => {
    const styles = collectStyles(buildScheduleTemplate(makeData([]), style));
    expect(styles.some((s) => s.background === bg)).toBe(true);
  });

  // Header text colour token per style (frozen from THEMES).
  const headerText: ReadonlyArray<readonly [ExportStyle, string]> = [
    ['minimal', '#0f172a'],
    ['branded', '#ffffff'],
    ['dark', '#f8fafc'],
  ];
  it.each(headerText)('style %s renders org name in header colour %s', (style, color) => {
    const styles = collectStyles(buildScheduleTemplate(makeData([]), style));
    expect(styles.some((s) => s.color === color)).toBe(true);
  });
});

// Logo presence matrix across styles.
describe('logo img presence matrix', () => {
  function hasImg(node: unknown): boolean {
    if (node == null || typeof node !== 'object') return false;
    const n = node as { type?: unknown; props?: { children?: unknown } };
    if (n.type === 'img') return true;
    const ch = n.props?.children;
    if (Array.isArray(ch)) return ch.some(hasImg);
    return hasImg(ch);
  }
  const cases: ReadonlyArray<readonly [ExportStyle, string | null, boolean]> = [
    ['minimal', null, false],
    ['minimal', 'data:image/png;base64,AAAA', true],
    ['branded', null, false],
    ['branded', 'data:image/png;base64,AAAA', true],
    ['dark', null, false],
    ['dark', 'data:image/png;base64,AAAA', true],
  ];
  it.each(cases)('style %s logo=%j -> img present %p', (style, logo, present) => {
    const tree = buildScheduleTemplate(
      makeData([], { orgLogoDataUrl: logo }),
      style,
    );
    expect(hasImg(tree)).toBe(present);
  });
});

// ===========================================================================
// 6. vis() — RTL reorder determinism, asserted as frozen literals.
// ===========================================================================
// Each [input, expectedVisual] pair was computed once via bidi-js and frozen.
// Pure Hebrew => simple character reversal; mixed Hebrew+digits keep the digit
// run LTR while the Hebrew run reverses.

describe('vis() — frozen RTL reorder table', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['מסעדה', 'הדעסמ'],
    ['ראשון', 'ןושאר'],
    ['שני', 'ינש'],
    ['שלישי', 'ישילש'],
    ['רביעי', 'יעיבר'],
    ['חמישי', 'ישימח'],
    ['שישי', 'ישיש'],
    ['שבת', 'תבש'],
    ['קופה', 'הפוק'],
    ['דנה כהן', 'ןהכ הנד'],
    ['א · ב · ג', 'ג · ב · א'],
    ['קופה 12:00', '12:00 הפוק'],
    ['— לא משובץ —', '— ץבושמ אל —'],
  ];

  it.each(cases)('vis(%j) -> %j', (input, expected) => {
    expect(vis(input)).toBe(expected);
  });

  it.each(cases)('vis(%j) is idempotent across calls', (input) => {
    expect(vis(input)).toBe(vis(input));
  });

  // Pure-Hebrew strings must equal their naive character reversal.
  const pureHebrew = ['מסעדה', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'קופה'];
  it.each(pureHebrew)('vis(%j) equals naive reversal for pure Hebrew', (s) => {
    expect(vis(s)).toBe([...s].reverse().join(''));
  });
});

// vis() is applied to org names + day names in the rendered tree.
describe('vis() — applied in rendered template', () => {
  const orgNames: ReadonlyArray<readonly [string, string]> = [
    ['מסעדה', 'הדעסמ'],
    ['קופה', 'הפוק'],
  ];
  it.each(orgNames)('org name %j appears reordered as %j', (org, visual) => {
    const texts = collectText(
      buildScheduleTemplate(makeData([], { orgName: org }), 'minimal'),
    );
    expect(texts).toContain(visual);
    expect(texts).not.toContain(org); // raw logical order absent
  });

  const dayNames: ReadonlyArray<readonly [string, string]> = [
    ['ראשון', 'ןושאר'],
    ['שני', 'ינש'],
    ['שלישי', 'ישילש'],
    ['רביעי', 'יעיבר'],
    ['חמישי', 'ישימח'],
    ['שישי', 'ישיש'],
    ['שבת', 'תבש'],
  ];
  it.each(dayNames)('day header %j is rendered visual as %j', (_day, visual) => {
    const texts = collectText(buildScheduleTemplate(makeData([]), 'minimal'));
    expect(texts).toContain(visual);
  });
});

// ===========================================================================
// 7. Column RTL ordering + per-weekday placement matrix.
// ===========================================================================
// After .reverse(), grid children run keys 6..0 (Saturday-first / Sunday-last).
// A shift on weekday idx D lands in array position (6 - D).

describe('day-column RTL placement matrix', () => {
  function gridCols(tree: ReturnType<typeof buildScheduleTemplate>) {
    const children = (tree.props as { children: unknown[] }).children;
    const grid = children[1] as { props: { children: unknown[] } };
    return grid.props.children as { key?: string | number; props: unknown }[];
  }

  it('column keys run 6..0 (Sunday is the rightmost / last)', () => {
    const cols = gridCols(buildScheduleTemplate(makeData([]), 'minimal'));
    expect(cols.map((c) => c.key)).toEqual(['6', '5', '4', '3', '2', '1', '0']);
  });

  // [label, startIsoUTC, weekdayIdx, arrayPos, dd/mm date label]
  const cases: ReadonlyArray<
    readonly [string, string, number, number, string]
  > = [
    ['sunday', '2026-06-07T08:00:00.000Z', 0, 6, '07/06'],
    ['monday', '2026-06-08T08:00:00.000Z', 1, 5, '08/06'],
    ['tuesday', '2026-06-09T08:00:00.000Z', 2, 4, '09/06'],
    ['wednesday', '2026-06-10T08:00:00.000Z', 3, 3, '10/06'],
    ['thursday', '2026-06-11T08:00:00.000Z', 4, 2, '11/06'],
    ['friday', '2026-06-12T08:00:00.000Z', 5, 1, '12/06'],
    ['saturday', '2026-06-13T08:00:00.000Z', 6, 0, '13/06'],
  ];

  it.each(cases)(
    '%s shift lands in array position %3$i with date %5$s',
    (label, startsAt, weekdayIdx, arrayPos, dateLabel) => {
      const data = makeData([
        shift({
          id: label,
          startsAt,
          endsAt: '2026-06-13T23:00:00.000Z',
          role: 'קופה',
          employeeNames: [label],
        }),
      ]);
      const cols = gridCols(buildScheduleTemplate(data, 'minimal'));
      // the matching column carries key = weekdayIdx and the employee name
      const col = cols[arrayPos]!;
      expect(String(col.key)).toBe(String(weekdayIdx));
      expect(collectText(col)).toContain(vis(label));
      expect(collectText(col)).toContain(dateLabel);
      // 08:00–HH appears only in this column, not the first (Saturday) col
      // unless it IS Saturday.
      if (arrayPos !== 0) {
        expect(collectText(cols[0]!)).not.toContain(vis(label));
      }
    },
  );
});
