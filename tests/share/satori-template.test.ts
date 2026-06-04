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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Re-implement the same bidi reorder the template uses, so we can compute the
// expected visual-order strings independently and assert the template matches.
const _bidi = bidiFactory();
function vis(str: string): string {
  if (!str) return str;
  const levels = _bidi.getEmbeddingLevels(str, 'rtl');
  return _bidi.getReorderedString(str, levels);
}

const ROLE_HEXES = [
  '#6366f1',
  '#10b981',
  '#f43f5e',
  '#f59e0b',
  '#0ea5e9',
  '#d946ef',
  '#06b6d4',
  '#84cc16',
];

// Walk a React element tree collecting every string text node in order.
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

// Walk tree collecting all `style` objects (for colour assertions).
function collectStyles(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
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
  partial: Partial<ExportShiftRow> & Pick<ExportShiftRow, 'id' | 'startsAt' | 'endsAt'>,
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
    weekStart: '2026-06-07', // a Sunday
    weekEnd: '2026-06-13',
    scheduleId: 'sched_test',
    shifts,
    employees: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// roleColor
// ---------------------------------------------------------------------------

describe('roleColor', () => {
  it('returns the fallback when role is null', () => {
    expect(roleColor(null, '#abcdef')).toBe('#abcdef');
  });

  it('returns the fallback (not a palette colour) when role is null regardless of fallback', () => {
    expect(roleColor(null, '#000000')).toBe('#000000');
    expect(roleColor(null, 'red')).toBe('red');
  });

  it('is deterministic — same role string yields the same colour across calls', () => {
    const a = roleColor('קופה', '#fallback');
    const b = roleColor('קופה', '#fallback');
    const c = roleColor('קופה', '#different');
    expect(a).toBe(b);
    expect(a).toBe(c); // fallback ignored for non-null role
  });

  it('always returns a colour from the fixed palette for non-null roles', () => {
    for (const role of ['קופה', 'מלצרות', 'מטבח', 'a', 'manager', '']) {
      // empty string is falsy -> fallback path; skip that one for palette check
      if (role === '') {
        expect(roleColor(role, '#fb')).toBe('#fb');
        continue;
      }
      expect(ROLE_HEXES).toContain(roleColor(role, '#fb'));
    }
  });

  it('matches the documented hash formula (h*31 + charCode, >>>0, mod palette)', () => {
    const cases = ['קופה', 'מלצרות', 'מטבח', 'kitchen', 'bar', 'x'];
    for (const role of cases) {
      let h = 0;
      for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0;
      const expected = ROLE_HEXES[h % ROLE_HEXES.length];
      expect(roleColor(role, '#fb')).toBe(expected);
    }
  });

  it('distinguishes at least several distinct roles (not all the same colour)', () => {
    const roles = ['קופה', 'מלצרות', 'מטבח', 'ניהול', 'שטיפה', 'בר', 'משלוחים', 'אבטחה'];
    const colours = new Set(roles.map((r) => roleColor(r, '#fb')));
    // Hash distribution should spread roles across multiple palette slots.
    expect(colours.size).toBeGreaterThanOrEqual(4);
  });

  it('single-character roles map to charCode mod palette length', () => {
    // For one char, h = charCode, so index = charCode % 8.
    const ch = 'A'; // 65
    expect(roleColor(ch, '#fb')).toBe(ROLE_HEXES[65 % 8]);
    const ch2 = 'B'; // 66
    expect(roleColor(ch2, '#fb')).toBe(ROLE_HEXES[66 % 8]);
  });
});

// ---------------------------------------------------------------------------
// groupShiftsByDay
// ---------------------------------------------------------------------------

describe('groupShiftsByDay', () => {
  const weekStart = '2026-06-07';

  it('returns exactly 7 buckets', () => {
    const buckets = groupShiftsByDay([], weekStart);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => Array.isArray(b))).toBe(true);
  });

  it('buckets shifts into the correct day index by start time', () => {
    const shifts = [
      shift({ id: 'd0', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T15:00:00.000Z' }),
      shift({ id: 'd1', startsAt: '2026-06-08T09:00:00.000Z', endsAt: '2026-06-08T17:00:00.000Z' }),
      shift({ id: 'd6', startsAt: '2026-06-13T10:00:00.000Z', endsAt: '2026-06-13T18:00:00.000Z' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[0]!.map((s) => s.id)).toEqual(['d0']);
    expect(buckets[1]!.map((s) => s.id)).toEqual(['d1']);
    expect(buckets[6]!.map((s) => s.id)).toEqual(['d6']);
    expect(buckets[2]).toEqual([]);
  });

  it('drops shifts before the week start (negative day index)', () => {
    const shifts = [
      shift({ id: 'before', startsAt: '2026-06-06T23:59:00.000Z', endsAt: '2026-06-07T01:00:00.000Z' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets.flat()).toEqual([]);
  });

  it('drops shifts on/after the 8th day (day index >= 7)', () => {
    const shifts = [
      shift({ id: 'after', startsAt: '2026-06-14T08:00:00.000Z', endsAt: '2026-06-14T12:00:00.000Z' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets.flat()).toEqual([]);
  });

  it('keeps a shift exactly at the week start boundary (00:00) in day 0', () => {
    const shifts = [
      shift({ id: 'edge', startsAt: '2026-06-07T00:00:00.000Z', endsAt: '2026-06-07T08:00:00.000Z' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[0]!.map((s) => s.id)).toEqual(['edge']);
  });

  it('keeps a shift at 23:59 of day 6 inside day 6', () => {
    const shifts = [
      shift({ id: 'lastsec', startsAt: '2026-06-13T23:59:00.000Z', endsAt: '2026-06-14T02:00:00.000Z' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[6]!.map((s) => s.id)).toEqual(['lastsec']);
  });

  it('within a day sorts by role (Hebrew collation) then start time', () => {
    // Same day, mix of roles and times — must come out role-sorted, then time.
    const shifts = [
      shift({ id: 'b-late', startsAt: '2026-06-07T18:00:00.000Z', endsAt: '2026-06-07T22:00:00.000Z', role: 'מלצרות' }),
      shift({ id: 'a-early', startsAt: '2026-06-07T09:00:00.000Z', endsAt: '2026-06-07T13:00:00.000Z', role: 'מטבח' }),
      shift({ id: 'b-early', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z', role: 'מלצרות' }),
    ];
    const day0 = groupShiftsByDay(shifts, weekStart)[0]!;
    // HARDCODED expected (no comparator reuse -> not a tautology):
    // 'מטבח' < 'מלצרות' under he-collation (ט before ל), so מטבח comes first;
    // within מלצרות, 08:00 (b-early) before 18:00 (b-late).
    expect(day0.map((s) => s.id)).toEqual(['a-early', 'b-early', 'b-late']);
    // Same-role shifts must sit adjacently and time-ordered.
    const waitresses = day0.filter((s) => s.role === 'מלצרות').map((s) => s.id);
    expect(waitresses).toEqual(['b-early', 'b-late']);
  });

  it('sorts null-role shifts LAST, after Hebrew-role shifts', () => {
    const shifts = [
      shift({ id: 'noRole', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z', role: null }),
      shift({ id: 'withRole', startsAt: '2026-06-07T07:00:00.000Z', endsAt: '2026-06-07T11:00:00.000Z', role: 'קופה' }),
    ];
    const day0 = groupShiftsByDay(shifts, weekStart)[0]!;
    // The null-role sentinel must collate AFTER any Hebrew role under 'he', so
    // role-less shifts render at the BOTTOM of the day, not the top.
    expect(day0.map((s) => s.id)).toEqual(['withRole', 'noRole']);
  });

  it('keeps null-role shifts last even with multiple Hebrew roles', () => {
    const shifts = [
      shift({ id: 'n', startsAt: '2026-06-07T06:00:00.000Z', endsAt: '2026-06-07T10:00:00.000Z', role: null }),
      shift({ id: 'tav', startsAt: '2026-06-07T07:00:00.000Z', endsAt: '2026-06-07T11:00:00.000Z', role: 'תפעול' }),
      shift({ id: 'kuf', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z', role: 'קופה' }),
    ];
    const day0 = groupShiftsByDay(shifts, weekStart)[0]!;
    expect(day0[day0.length - 1]!.id).toBe('n');
  });

  it('buckets a late-night Israel shift to the correct LOCAL day, not the UTC day', () => {
    // 2026-06-07T22:30Z is Sunday in UTC, but Asia/Jerusalem is UTC+3 (IDT) so
    // locally it is Monday 01:30 — it must land in day 1 (Monday), not day 0.
    const shifts = [
      shift({
        id: 'lateNight',
        startsAt: '2026-06-07T22:30:00.000Z',
        endsAt: '2026-06-08T04:00:00.000Z',
        timezone: 'Asia/Jerusalem',
        role: 'אבטחה',
      }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[0]!.map((s) => s.id)).toEqual([]);
    expect(buckets[1]!.map((s) => s.id)).toEqual(['lateNight']);
  });

  it('buckets an evening Israel shift onto its local day (still same day here)', () => {
    // 19:00 local Sunday = 16:00Z Sunday — stays on day 0.
    const shifts = [
      shift({
        id: 'eve',
        startsAt: '2026-06-07T16:00:00.000Z',
        endsAt: '2026-06-07T20:00:00.000Z',
        timezone: 'Asia/Jerusalem',
        role: 'מלצרות',
      }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[0]!.map((s) => s.id)).toEqual(['eve']);
  });

  it('places multiple shifts on the same day and preserves total count', () => {
    const shifts = [
      shift({ id: 's1', startsAt: '2026-06-09T08:00:00.000Z', endsAt: '2026-06-09T12:00:00.000Z', role: 'a' }),
      shift({ id: 's2', startsAt: '2026-06-09T13:00:00.000Z', endsAt: '2026-06-09T17:00:00.000Z', role: 'a' }),
      shift({ id: 's3', startsAt: '2026-06-09T18:00:00.000Z', endsAt: '2026-06-09T22:00:00.000Z', role: 'b' }),
    ];
    const buckets = groupShiftsByDay(shifts, weekStart);
    expect(buckets[2]).toHaveLength(3);
    expect(buckets.flat()).toHaveLength(3);
  });

  it('is order-independent — shuffled input yields the same bucketing', () => {
    const shifts = [
      shift({ id: 'x', startsAt: '2026-06-10T08:00:00.000Z', endsAt: '2026-06-10T12:00:00.000Z', role: 'z' }),
      shift({ id: 'y', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z', role: 'q' }),
    ];
    const a = groupShiftsByDay(shifts, weekStart);
    const b = groupShiftsByDay([...shifts].reverse(), weekStart);
    expect(a.map((d) => d.map((s) => s.id))).toEqual(b.map((d) => d.map((s) => s.id)));
  });
});

// ---------------------------------------------------------------------------
// vis() — verified through buildScheduleTemplate output (org name uses vis)
// ---------------------------------------------------------------------------

describe('vis (RTL reorder) via template output', () => {
  it('reorders a pure-Hebrew org name to visual order (reversed)', () => {
    const data = makeData([], { orgName: 'מסעדה' });
    const tree = buildScheduleTemplate(data, 'minimal');
    const texts = collectText(tree);
    expect(texts).toContain(vis('מסעדה'));
    // pure Hebrew -> simple reverse
    expect(vis('מסעדה')).toBe([...'מסעדה'].reverse().join(''));
    // the raw logical-order string must NOT appear (it was reordered)
    expect(texts).not.toContain('מסעדה');
  });

  it('is deterministic — same string reorders identically each call', () => {
    expect(vis('ראשון')).toBe(vis('ראשון'));
    expect(vis('שבת')).toBe('תבש');
  });

  it('renders Hebrew day names in visual order (ראשון -> ןושאר)', () => {
    const tree = buildScheduleTemplate(makeData([]), 'minimal');
    const texts = collectText(tree);
    for (const day of ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']) {
      expect(texts).toContain(vis(day));
    }
  });

  it('reorders the role label inside a rendered shift', () => {
    const data = makeData([
      shift({
        id: 's',
        startsAt: '2026-06-07T08:00:00.000Z',
        endsAt: '2026-06-07T15:00:00.000Z',
        role: 'קופה',
        employeeNames: ['דנה כהן'],
      }),
    ]);
    const texts = collectText(buildScheduleTemplate(data, 'branded'));
    expect(texts).toContain(vis('קופה'));
    expect(texts).toContain(vis('דנה כהן'));
  });

  it('reorders mixed Hebrew+digits deterministically (digits stay LTR runs)', () => {
    // matches the bidi-js behaviour the template relies on
    expect(vis('קופה 12:00')).toBe('12:00 הפוק');
  });

  it('returns empty string unchanged', () => {
    expect(vis('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildScheduleTemplate — overall structure & RTL column ordering
// ---------------------------------------------------------------------------

describe('buildScheduleTemplate structure', () => {
  function gridCols(tree: ReturnType<typeof buildScheduleTemplate>) {
    // root children: [header, grid, footer]; grid children are the day columns
    const children = (tree.props as { children: unknown[] }).children;
    const grid = children[1] as { props: { children: unknown[] } };
    return grid.props.children as { key?: string | number; props: unknown }[];
  }

  it('produces 7 day columns', () => {
    const cols = gridCols(buildScheduleTemplate(makeData([]), 'minimal'));
    expect(cols).toHaveLength(7);
  });

  it('reverses day columns so Sunday (idx 0) is the LAST element / rightmost in RTL', () => {
    const cols = gridCols(buildScheduleTemplate(makeData([]), 'minimal'));
    // After .reverse(): array[0] is Saturday (key 6), array[6] is Sunday (key 0).
    expect(cols[0]!.key).toBe('6');
    expect(cols[6]!.key).toBe('0');
    // full key sequence is 6..0
    expect(cols.map((c) => c.key)).toEqual(['6', '5', '4', '3', '2', '1', '0']);
  });

  it('places a Sunday shift in the rightmost (last) column', () => {
    const data = makeData([
      shift({
        id: 'sun',
        startsAt: '2026-06-07T08:00:00.000Z', // Sunday
        endsAt: '2026-06-07T15:00:00.000Z',
        role: 'קופה',
        employeeNames: ['דנה'],
      }),
    ]);
    const cols = gridCols(buildScheduleTemplate(data, 'minimal'));
    const sundayCol = cols[6]!; // rightmost
    const texts = collectText(sundayCol);
    expect(sundayCol.key).toBe('0');
    expect(texts).toContain('08:00–15:00');
    expect(texts).toContain(vis('קופה'));
    expect(texts).toContain(vis('דנה'));
    // the Saturday (leftmost) column must NOT contain this shift's time
    expect(collectText(cols[0])).not.toContain('08:00–15:00');
  });

  it('renders shift times in the shift LOCAL timezone (Asia/Jerusalem summer = UTC+3)', () => {
    const data = makeData([
      shift({
        id: 't',
        startsAt: '2026-06-09T07:05:00.000Z',
        endsAt: '2026-06-09T19:30:00.000Z',
        timezone: 'Asia/Jerusalem',
        role: 'מטבח',
      }),
    ]);
    const texts = collectText(buildScheduleTemplate(data, 'dark'));
    // 07:05Z -> 10:05 local, 19:30Z -> 22:30 local (IDT, UTC+3)
    expect(texts).toContain('10:05–22:30');
    expect(texts).not.toContain('07:05–19:30');
  });

  it('falls back to UTC formatting when a shift has no timezone', () => {
    const data = makeData([
      shift({
        id: 't',
        startsAt: '2026-06-09T07:05:00.000Z',
        endsAt: '2026-06-09T19:30:00.000Z',
        role: 'מטבח',
      }),
    ]);
    const texts = collectText(buildScheduleTemplate(data, 'dark'));
    expect(texts).toContain('07:05–19:30');
  });

  it('shows the "unassigned" placeholder when a shift has no employees', () => {
    const data = makeData([
      shift({
        id: 'empty',
        startsAt: '2026-06-08T08:00:00.000Z',
        endsAt: '2026-06-08T12:00:00.000Z',
        role: 'בר',
        employeeNames: [],
      }),
    ]);
    const texts = collectText(buildScheduleTemplate(data, 'minimal'));
    expect(texts).toContain(vis('— לא משובץ —'));
  });

  it('caps a single day at 6 rendered shifts', () => {
    const many: ExportShiftRow[] = [];
    for (let i = 0; i < 10; i++) {
      const hh = (6 + i).toString().padStart(2, '0');
      many.push(
        shift({
          id: `m${i}`,
          startsAt: `2026-06-07T${hh}:00:00.000Z`,
          endsAt: `2026-06-07T${hh}:30:00.000Z`,
          role: 'קופה',
          employeeNames: [`עובד${i}`],
        }),
      );
    }
    const cols = gridCols(buildScheduleTemplate(makeData(many), 'minimal'));
    const sundayCol = cols[6];
    const texts = collectText(sundayCol);
    const times = texts.filter((t) => /^\d{2}:\d{2}–\d{2}:\d{2}$/.test(t));
    expect(times).toHaveLength(6); // slice(0,6)
  });

  it('caps displayed employee names at 3 per shift', () => {
    const data = makeData([
      shift({
        id: 'crowd',
        startsAt: '2026-06-07T08:00:00.000Z',
        endsAt: '2026-06-07T12:00:00.000Z',
        role: 'קופה',
        employeeNames: ['א', 'ב', 'ג', 'ד', 'ה'],
      }),
    ]);
    const texts = collectText(buildScheduleTemplate(data, 'minimal'));
    // first three joined with ' · ', then vis()-reordered
    expect(texts).toContain(vis('א · ב · ג'));
    expect(texts).not.toContain(vis('א · ב · ג · ד'));
  });

  it('renders the footer summary with employee and shift counts', () => {
    const data = makeData(
      [
        shift({ id: '1', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z' }),
        shift({ id: '2', startsAt: '2026-06-08T08:00:00.000Z', endsAt: '2026-06-08T12:00:00.000Z' }),
      ],
      { employees: [{ id: 'e1', fullName: 'a' }, { id: 'e2', fullName: 'b' }, { id: 'e3', fullName: 'c' }] },
    );
    const texts = collectText(buildScheduleTemplate(data, 'minimal'));
    expect(texts).toContain(vis('3 עובדים · 2 משמרות'));
  });

  it('applies the role colour to the shift role label style', () => {
    const role = 'קופה';
    let h = 0;
    for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0;
    const expectedColor = ROLE_HEXES[h % ROLE_HEXES.length];
    const data = makeData([
      shift({
        id: 'c',
        startsAt: '2026-06-07T08:00:00.000Z',
        endsAt: '2026-06-07T12:00:00.000Z',
        role,
        employeeNames: ['x'],
      }),
    ]);
    const styles = collectStyles(buildScheduleTemplate(data, 'minimal'));
    const colored = styles.filter((s) => s.color === expectedColor);
    // role label span + the borderRight accent both use the role colour
    expect(colored.length).toBeGreaterThanOrEqual(1);
    const borders = styles.filter((s) => s.borderRight === `3px solid ${expectedColor}`);
    expect(borders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a logo img element only when orgLogoDataUrl is provided', () => {
    const withLogo = buildScheduleTemplate(
      makeData([], { orgLogoDataUrl: 'data:image/png;base64,AAAA' }),
      'branded',
    );
    function hasImg(node: unknown): boolean {
      if (node == null || typeof node !== 'object') return false;
      const n = node as { type?: unknown; props?: { children?: unknown } };
      if (n.type === 'img') return true;
      const ch = n.props?.children;
      if (Array.isArray(ch)) return ch.some(hasImg);
      return hasImg(ch);
    }
    expect(hasImg(withLogo)).toBe(true);
    const noLogo = buildScheduleTemplate(makeData([]), 'branded');
    expect(hasImg(noLogo)).toBe(false);
  });

  it('uses theme background per style (minimal=white, dark=near-black)', () => {
    const minimal = buildScheduleTemplate(makeData([]), 'minimal');
    const dark = buildScheduleTemplate(makeData([]), 'dark');
    const minStyle = (minimal.props as { style: Record<string, unknown> }).style;
    const darkStyle = (dark.props as { style: Record<string, unknown> }).style;
    expect(minStyle.background).toBe('#ffffff');
    expect(darkStyle.background).toBe('#020617');
    // fixed canvas dimensions
    expect(minStyle.width).toBe(1200);
    expect(minStyle.height).toBe(675);
  });

  it('renders a shift onto each correct weekday column independently', () => {
    const data = makeData([
      shift({ id: 'sun', startsAt: '2026-06-07T08:00:00.000Z', endsAt: '2026-06-07T12:00:00.000Z', role: 'a', employeeNames: ['S'] }),
      shift({ id: 'wed', startsAt: '2026-06-10T08:00:00.000Z', endsAt: '2026-06-10T12:00:00.000Z', role: 'b', employeeNames: ['W'] }),
    ]);
    const cols = gridCols(buildScheduleTemplate(data, 'minimal'));
    // Sunday idx0 -> array position 6; Wednesday idx3 -> array position 3
    expect(collectText(cols[6])).toContain(vis('S'));
    expect(collectText(cols[3])).toContain(vis('W'));
    expect(collectText(cols[6])).not.toContain(vis('W'));
  });

  it('renders day date labels dd/mm advancing by weekday', () => {
    const cols = gridCols(buildScheduleTemplate(makeData([]), 'minimal'));
    // rightmost (Sunday) = 07/06, leftmost (Saturday) = 13/06
    expect(collectText(cols[6])).toContain('07/06');
    expect(collectText(cols[0])).toContain('13/06');
  });
});
