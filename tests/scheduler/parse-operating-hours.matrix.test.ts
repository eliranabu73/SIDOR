import { parseOperatingHours } from '../../src/modules/scheduler/operating-hours.service';

/**
 * Pure-function matrix tests for parseOperatingHours.
 *
 * Signature: parseOperatingHours(orgRules, locationRules?) -> ParsedHours | null
 *   ParsedHours = { start, end, openDays:number[], maxHoursDay:number, openDaysDefaulted:boolean }
 *
 * Rules under test (from source):
 *  - merged = { ...orgRules, ...locationRules }  (location keys WIN on collision)
 *  - businessHoursStart/End must both be strings, else -> null
 *  - openDays: from activeDaysOfWeek (number[] filtered 0..6) if it's an array,
 *      else from dailyStandards { "0".."6": hours } where hours > 0 means open.
 *  - activeDaysOfWeek takes precedence over dailyStandards (the `else` branch).
 *  - if openDays ends up empty -> default [0,1,2,3,4] (Sun-Thu) and openDaysDefaulted=true
 *  - maxHoursDay: finite & > 0 -> that value, else default 9
 *
 * No DB, no timezone math here (parse is tz-agnostic). Fully deterministic.
 */

const SUN_THU = [0, 1, 2, 3, 4];

// ---------------------------------------------------------------------------
// 1. null / missing business hours -> always null
// ---------------------------------------------------------------------------
describe('parseOperatingHours: null business hours', () => {
  const nullCases: Array<[string, unknown]> = [
    ['null org rules', null],
    ['undefined org rules', undefined],
    ['empty object', {}],
    ['array (not a record)', [1, 2, 3]],
    ['string primitive', 'not-an-object'],
    ['number primitive', 42],
    ['boolean primitive', true],
    ['only start, no end', { businessHoursStart: '08:00' }],
    ['only end, no start', { businessHoursEnd: '16:00' }],
    ['start non-string (number)', { businessHoursStart: 800, businessHoursEnd: '16:00' }],
    ['end non-string (number)', { businessHoursStart: '08:00', businessHoursEnd: 1600 }],
    ['start null', { businessHoursStart: null, businessHoursEnd: '16:00' }],
    ['end null', { businessHoursStart: '08:00', businessHoursEnd: null }],
    ['start empty string -> falsy -> null', { businessHoursStart: '', businessHoursEnd: '16:00' }],
    ['end empty string -> falsy -> null', { businessHoursStart: '08:00', businessHoursEnd: '' }],
    ['both non-string', { businessHoursStart: {}, businessHoursEnd: [] }],
    ['activeDays present but no hours', { activeDaysOfWeek: [0, 1, 2] }],
    ['dailyStandards present but no hours', { dailyStandards: { '0': 8 } }],
    ['maxHoursDay present but no hours', { maxHoursDay: 10 }],
  ];

  it.each(nullCases)('%s -> null', (_label, rules) => {
    expect(parseOperatingHours(rules)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. start / end passthrough (verbatim strings, not validated here)
// ---------------------------------------------------------------------------
describe('parseOperatingHours: start/end passthrough', () => {
  const cases: Array<[string, string]> = [
    ['08:00', '16:00'],
    ['00:00', '23:59'],
    ['09:30', '17:30'],
    ['06:00', '14:00'],
    ['14:00', '22:00'],
    ['22:00', '06:00'], // overnight, parse doesn't care
    ['7:5', '9:9'], // not validated by parse
    ['garbage', 'also-garbage'], // strings pass through verbatim
  ];

  it.each(cases)('start=%s end=%s passes through verbatim', (start, end) => {
    const res = parseOperatingHours({ businessHoursStart: start, businessHoursEnd: end });
    expect(res).not.toBeNull();
    expect(res!.start).toBe(start);
    expect(res!.end).toBe(end);
  });
});

// ---------------------------------------------------------------------------
// 3. activeDaysOfWeek explicit subsets -> exact openDays (preserve order/dupes
//    as written; only filter to numbers in 0..6)
// ---------------------------------------------------------------------------
describe('parseOperatingHours: activeDaysOfWeek subsets', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };

  // [label, input active array, expected openDays]
  const cases: Array<[string, unknown[], number[]]> = [
    ['single Sunday', [0], [0]],
    ['single Saturday', [6], [6]],
    ['Sun-Thu', [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]],
    ['Mon-Fri', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['full week', [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]],
    ['weekend only', [5, 6], [5, 6]],
    ['mid-week pair', [2, 4], [2, 4]],
    ['unsorted order preserved', [4, 0, 2], [4, 0, 2]],
    ['descending order preserved', [6, 5, 4], [6, 5, 4]],
    ['duplicates preserved', [1, 1, 2], [1, 1, 2]],
    ['filters out negative', [-1, 0, 1], [0, 1]],
    ['filters out >6', [5, 6, 7, 8], [5, 6]],
    ['filters out string members', [0, '1' as unknown, 2], [0, 2]],
    ['filters out null member', [0, null as unknown, 3], [0, 3]],
    ['float 2.5 is numeric & in 0..6 -> KEPT', [1, 2.5 as unknown, 3], [1, 2.5, 3]],
    ['boundary 0 and 6 kept', [0, 6], [0, 6]],
    ['all-invalid -> empty -> default', [7, 8, -3], SUN_THU],
    ['empty array -> default Sun-Thu', [], SUN_THU],
  ];

  it.each(cases)('%s', (_label, active, expected) => {
    const res = parseOperatingHours({ ...base, activeDaysOfWeek: active });
    expect(res).not.toBeNull();
    expect(res!.openDays).toEqual(expected);
  });

  it('2.5 is numeric and within 0..6 so it IS kept (documents filter semantics)', () => {
    const res = parseOperatingHours({ ...base, activeDaysOfWeek: [2.5] });
    expect(res!.openDays).toEqual([2.5]);
    expect(res!.openDaysDefaulted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. openDaysDefaulted flag
// ---------------------------------------------------------------------------
describe('parseOperatingHours: openDaysDefaulted flag', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };

  const cases: Array<[string, unknown, boolean, number[]]> = [
    ['explicit active set -> not defaulted', { ...base, activeDaysOfWeek: [0, 1] }, false, [0, 1]],
    ['empty active -> defaulted', { ...base, activeDaysOfWeek: [] }, true, SUN_THU],
    ['all-invalid active -> defaulted', { ...base, activeDaysOfWeek: [9, 10] }, true, SUN_THU],
    ['no day info at all -> defaulted', { ...base }, true, SUN_THU],
    ['dailyStandards with open day -> not defaulted', { ...base, dailyStandards: { '1': 8 } }, false, [1]],
    ['dailyStandards all zero -> defaulted', { ...base, dailyStandards: { '0': 0, '1': 0 } }, true, SUN_THU],
  ];

  it.each(cases)('%s', (_label, rules, expectedDefaulted, expectedDays) => {
    const res = parseOperatingHours(rules);
    expect(res).not.toBeNull();
    expect(res!.openDaysDefaulted).toBe(expectedDefaulted);
    expect(res!.openDays).toEqual(expectedDays);
  });
});

// ---------------------------------------------------------------------------
// 5. dailyStandards grids: hours > 0 = open, else closed
// ---------------------------------------------------------------------------
describe('parseOperatingHours: dailyStandards grids', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };

  // [label, dailyStandards record, expected openDays]
  const cases: Array<[string, Record<string, unknown>, number[]]> = [
    ['only Sunday open', { '0': 8 }, [0]],
    ['only Saturday open', { '6': 5 }, [6]],
    ['Sun-Thu open (8h each)', { '0': 8, '1': 8, '2': 8, '3': 8, '4': 8 }, [0, 1, 2, 3, 4]],
    ['Mon/Wed/Fri open', { '1': 6, '3': 6, '5': 6 }, [1, 3, 5]],
    ['zeros are closed', { '0': 0, '1': 8, '2': 0, '3': 8 }, [1, 3]],
    ['negative hours = closed (not > 0)', { '0': -4, '1': 8 }, [1]],
    ['fractional positive open', { '2': 0.5 }, [2]],
    ['large hours open', { '4': 24 }, [4]],
    ['string-number "8" coerced positive', { '1': '8' }, [1]],
    ['string-number "0" coerced -> closed', { '1': '0', '2': 8 }, [2]],
    ['NaN value -> not finite -> closed', { '0': 'abc', '1': 8 }, [1]],
    ['null value -> Number(null)=0 -> closed', { '0': null, '1': 8 }, [1]],
    ['out-of-range key "7" ignored (loop 0..6)', { '7': 8, '2': 8 }, [2]],
    ['always emits ascending order 0..6', { '4': 8, '1': 8, '0': 8 }, [0, 1, 4]],
    ['full week open', { '0': 8, '1': 8, '2': 8, '3': 8, '4': 8, '5': 8, '6': 8 }, [0, 1, 2, 3, 4, 5, 6]],
    ['all zeros -> default Sun-Thu', { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 }, SUN_THU],
  ];

  it.each(cases)('%s', (_label, daily, expected) => {
    const res = parseOperatingHours({ ...base, dailyStandards: daily });
    expect(res).not.toBeNull();
    expect(res!.openDays).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// 6. activeDaysOfWeek PRECEDENCE over dailyStandards
//    (source: if active is an array, dailyStandards is never consulted)
// ---------------------------------------------------------------------------
describe('parseOperatingHours: activeDaysOfWeek precedence over dailyStandards', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };

  const cases: Array<[string, unknown, Record<string, unknown>, number[]]> = [
    ['active wins over different daily', [0, 1], { '5': 8, '6': 8 }, [0, 1]],
    ['active single wins over full daily', [3], { '0': 8, '1': 8, '2': 8 }, [3]],
    ['empty active array still beats daily -> default', [], { '6': 8 }, SUN_THU],
    ['all-invalid active beats daily -> default', [9], { '2': 8 }, SUN_THU],
    ['active is array so daily ignored even if active filters to subset', [2, 9], { '6': 8 }, [2]],
  ];

  it.each(cases)('%s', (_label, active, daily, expected) => {
    const res = parseOperatingHours({ ...base, activeDaysOfWeek: active, dailyStandards: daily });
    expect(res).not.toBeNull();
    expect(res!.openDays).toEqual(expected);
  });

  it('non-array activeDaysOfWeek falls through to dailyStandards', () => {
    // active is an object, not an array -> Array.isArray false -> uses dailyStandards
    const res = parseOperatingHours({
      ...base,
      activeDaysOfWeek: { not: 'array' } as unknown,
      dailyStandards: { '6': 8 },
    });
    expect(res!.openDays).toEqual([6]);
  });

  it('string activeDaysOfWeek falls through to dailyStandards', () => {
    const res = parseOperatingHours({
      ...base,
      activeDaysOfWeek: 'mon-fri' as unknown,
      dailyStandards: { '1': 8, '2': 8 },
    });
    expect(res!.openDays).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// 7. location rules OVERRIDE org rules (merge matrix)
//    merged = { ...org, ...location } so location keys win.
// ---------------------------------------------------------------------------
describe('parseOperatingHours: location overrides org (merge matrix)', () => {
  it('location supplies hours when org has none', () => {
    const res = parseOperatingHours(null, { businessHoursStart: '09:00', businessHoursEnd: '17:00' });
    expect(res).not.toBeNull();
    expect(res!.start).toBe('09:00');
    expect(res!.end).toBe('17:00');
  });

  it('location start/end overrides org start/end', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00' },
      { businessHoursStart: '10:00', businessHoursEnd: '18:00' },
    );
    expect(res!.start).toBe('10:00');
    expect(res!.end).toBe('18:00');
  });

  it('org provides start, location provides end (key-level merge)', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '07:00' },
      { businessHoursEnd: '15:00' },
    );
    expect(res!.start).toBe('07:00');
    expect(res!.end).toBe('15:00');
  });

  it('location activeDaysOfWeek overrides org activeDaysOfWeek', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [0, 1, 2, 3, 4] },
      { activeDaysOfWeek: [5, 6] },
    );
    expect(res!.openDays).toEqual([5, 6]);
  });

  it('location activeDaysOfWeek overrides org dailyStandards', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', dailyStandards: { '0': 8, '1': 8 } },
      { activeDaysOfWeek: [6] },
    );
    expect(res!.openDays).toEqual([6]);
  });

  it('location dailyStandards overrides org dailyStandards', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', dailyStandards: { '0': 8, '1': 8 } },
      { dailyStandards: { '5': 8 } },
    );
    expect(res!.openDays).toEqual([5]);
  });

  it('location maxHoursDay overrides org maxHoursDay', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', maxHoursDay: 8 },
      { maxHoursDay: 12 },
    );
    expect(res!.maxHoursDay).toBe(12);
  });

  it('org keys survive when location omits them', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [2, 3], maxHoursDay: 7 },
      { businessHoursStart: '06:00' }, // only overrides start
    );
    expect(res!.start).toBe('06:00');
    expect(res!.end).toBe('16:00'); // from org
    expect(res!.openDays).toEqual([2, 3]); // from org
    expect(res!.maxHoursDay).toBe(7); // from org
  });

  it('empty location object leaves org untouched', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [1] },
      {},
    );
    expect(res!.start).toBe('08:00');
    expect(res!.openDays).toEqual([1]);
  });

  it('non-record location (array) is treated as {} and ignored', () => {
    const res = parseOperatingHours(
      { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [4] },
      [1, 2, 3],
    );
    expect(res!.openDays).toEqual([4]);
    expect(res!.start).toBe('08:00');
  });

  // merge matrix table: which side wins for start
  const startMatrix: Array<[string, unknown, unknown, string | null]> = [
    ['both set -> location', '08:00', '10:00', '10:00'],
    ['org only -> org', '08:00', undefined, '08:00'],
    ['loc only -> loc', undefined, '11:00', '11:00'],
    ['loc empty-string falsy -> null overall', '08:00', '', null],
  ];

  it.each(startMatrix)('start merge: %s', (_label, orgStart, locStart, expectedStart) => {
    const org: Record<string, unknown> = { businessHoursEnd: '20:00' };
    if (orgStart !== undefined) org['businessHoursStart'] = orgStart;
    const loc: Record<string, unknown> = {};
    if (locStart !== undefined) loc['businessHoursStart'] = locStart;
    const res = parseOperatingHours(org, loc);
    if (expectedStart === null) {
      expect(res).toBeNull();
    } else {
      expect(res!.start).toBe(expectedStart);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. maxHoursDay: default 9 vs explicit
// ---------------------------------------------------------------------------
describe('parseOperatingHours: maxHoursDay default vs explicit', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };

  const cases: Array<[string, unknown, number]> = [
    ['absent -> default 9', undefined, 9],
    ['explicit 8', 8, 8],
    ['explicit 10', 10, 10],
    ['explicit 12', 12, 12],
    ['explicit 6', 6, 6],
    ['fractional 7.5 kept', 7.5, 7.5],
    ['zero -> not > 0 -> default 9', 0, 9],
    ['negative -> not > 0 -> default 9', -3, 9],
    ['NaN string -> not finite -> default 9', 'abc', 9],
    ['null -> Number(null)=0 -> default 9', null, 9],
    ['string-number "11" coerced', '11', 11],
    ['Infinity -> not finite -> default 9', Infinity, 9],
    ['boolean true -> Number(true)=1 -> 1', true, 1],
    ['boolean false -> Number(false)=0 -> default 9', false, 9],
    ['huge 1000 kept', 1000, 1000],
  ];

  it.each(cases)('%s', (_label, maxHoursDay, expected) => {
    const rules: Record<string, unknown> = { ...base };
    if (maxHoursDay !== undefined) rules['maxHoursDay'] = maxHoursDay;
    const res = parseOperatingHours(rules);
    expect(res).not.toBeNull();
    expect(res!.maxHoursDay).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 9. Full ParsedHours shape assertions (combined fields at once)
// ---------------------------------------------------------------------------
describe('parseOperatingHours: full shape combinations', () => {
  interface ShapeCase {
    label: string;
    org: unknown;
    loc?: unknown;
    start: string;
    end: string;
    openDays: number[];
    maxHoursDay: number;
    openDaysDefaulted: boolean;
  }

  const cases: ShapeCase[] = [
    {
      label: 'org full Sun-Thu explicit maxHours',
      org: { businessHoursStart: '08:00', businessHoursEnd: '17:00', activeDaysOfWeek: [0, 1, 2, 3, 4], maxHoursDay: 8 },
      start: '08:00',
      end: '17:00',
      openDays: [0, 1, 2, 3, 4],
      maxHoursDay: 8,
      openDaysDefaulted: false,
    },
    {
      label: 'org hours only -> default days + default max',
      org: { businessHoursStart: '09:00', businessHoursEnd: '21:00' },
      start: '09:00',
      end: '21:00',
      openDays: SUN_THU,
      maxHoursDay: 9,
      openDaysDefaulted: true,
    },
    {
      label: 'dailyStandards weekend + explicit max 12',
      org: { businessHoursStart: '10:00', businessHoursEnd: '23:00', dailyStandards: { '5': 8, '6': 8 }, maxHoursDay: 12 },
      start: '10:00',
      end: '23:00',
      openDays: [5, 6],
      maxHoursDay: 12,
      openDaysDefaulted: false,
    },
    {
      label: 'location overrides everything',
      org: { businessHoursStart: '08:00', businessHoursEnd: '16:00', activeDaysOfWeek: [0, 1], maxHoursDay: 8 },
      loc: { businessHoursStart: '12:00', businessHoursEnd: '20:00', activeDaysOfWeek: [4, 5, 6], maxHoursDay: 10 },
      start: '12:00',
      end: '20:00',
      openDays: [4, 5, 6],
      maxHoursDay: 10,
      openDaysDefaulted: false,
    },
  ];

  it.each(cases)('$label', (c) => {
    const res = parseOperatingHours(c.org, c.loc);
    expect(res).not.toBeNull();
    expect(res!.start).toBe(c.start);
    expect(res!.end).toBe(c.end);
    expect(res!.openDays).toEqual(c.openDays);
    expect(res!.maxHoursDay).toBe(c.maxHoursDay);
    expect(res!.openDaysDefaulted).toBe(c.openDaysDefaulted);
  });
});

// ---------------------------------------------------------------------------
// 10. Programmatic breadth: every single-day activeDaysOfWeek 0..6
// ---------------------------------------------------------------------------
describe('parseOperatingHours: every single open day', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };
  const singleDays: number[] = [0, 1, 2, 3, 4, 5, 6];

  it.each(singleDays)('activeDaysOfWeek=[%i] -> openDays=[that day]', (d) => {
    const res = parseOperatingHours({ ...base, activeDaysOfWeek: [d] });
    expect(res!.openDays).toEqual([d]);
    expect(res!.openDaysDefaulted).toBe(false);
  });

  it.each(singleDays)('dailyStandards {%i:8} -> openDays=[that day]', (d) => {
    const res = parseOperatingHours({ ...base, dailyStandards: { [String(d)]: 8 } });
    expect(res!.openDays).toEqual([d]);
    expect(res!.openDaysDefaulted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Programmatic breadth: all 2-day pairs via activeDaysOfWeek
// ---------------------------------------------------------------------------
describe('parseOperatingHours: all 2-day pairs', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };
  const pairs: Array<[number, number]> = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) pairs.push([a, b]);
  }
  // 21 pairs total

  it.each(pairs)('activeDaysOfWeek=[%i,%i]', (a, b) => {
    const res = parseOperatingHours({ ...base, activeDaysOfWeek: [a, b] });
    expect(res!.openDays).toEqual([a, b]);
  });

  it.each(pairs)('dailyStandards open for %i and %i (ascending output)', (a, b) => {
    const res = parseOperatingHours({ ...base, dailyStandards: { [String(a)]: 8, [String(b)]: 8 } });
    // dailyStandards always emits ascending 0..6 order; a<b by construction
    expect(res!.openDays).toEqual([a, b]);
  });
});

// ---------------------------------------------------------------------------
// 12. Programmatic breadth: maxHoursDay across a numeric sweep
// ---------------------------------------------------------------------------
describe('parseOperatingHours: maxHoursDay numeric sweep', () => {
  const base = { businessHoursStart: '08:00', businessHoursEnd: '16:00' };
  // positive values pass through verbatim
  const positives: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 24];

  it.each(positives)('maxHoursDay=%i passes through', (v) => {
    const res = parseOperatingHours({ ...base, maxHoursDay: v });
    expect(res!.maxHoursDay).toBe(v);
  });

  // non-positive / invalid all default to 9
  const defaulters: Array<[string, unknown]> = [
    ['0', 0],
    ['-1', -1],
    ['-100', -100],
    ['NaN literal', NaN],
    ['empty string', ''],
    ['object', {}],
    ['array', []],
    ['undefined explicitly', undefined],
  ];

  it.each(defaulters)('maxHoursDay %s -> default 9', (_label, v) => {
    const rules: Record<string, unknown> = { ...base };
    if (v !== undefined) rules['maxHoursDay'] = v;
    const res = parseOperatingHours(rules);
    expect(res!.maxHoursDay).toBe(9);
  });
});
