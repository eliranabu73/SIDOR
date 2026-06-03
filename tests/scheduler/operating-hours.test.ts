import { parseOperatingHours } from '../../src/modules/scheduler/operating-hours.service';

describe('parseOperatingHours', () => {
  it('returns null when no business hours are set', () => {
    expect(parseOperatingHours({})).toBeNull();
    expect(parseOperatingHours({ businessHoursStart: '09:00' })).toBeNull();
  });

  it('derives open days from dailyStandards (>0 = open, 0 = closed)', () => {
    const r = parseOperatingHours({
      businessHoursStart: '06:30',
      businessHoursEnd: '22:00',
      dailyStandards: { '0': 6.5, '1': 6, '2': 7, '3': 8, '4': 8, '5': 6, '6': 0 },
      maxHoursDay: 10,
    });
    expect(r).not.toBeNull();
    expect(r!.openDays).toEqual([0, 1, 2, 3, 4, 5]); // Saturday closed
    expect(r!.start).toBe('06:30');
    expect(r!.end).toBe('22:00');
    expect(r!.maxHoursDay).toBe(10);
  });

  it('prefers an explicit activeDaysOfWeek array', () => {
    const r = parseOperatingHours({
      businessHoursStart: '09:00',
      businessHoursEnd: '18:00',
      activeDaysOfWeek: [0, 1, 2, 3, 4],
      dailyStandards: { '6': 5 }, // should be ignored in favour of activeDaysOfWeek
    });
    expect(r!.openDays).toEqual([0, 1, 2, 3, 4]);
  });

  it('falls back to Sun–Thu when open days cannot be determined', () => {
    const r = parseOperatingHours({ businessHoursStart: '09:00', businessHoursEnd: '17:00' });
    expect(r!.openDays).toEqual([0, 1, 2, 3, 4]);
    expect(r!.maxHoursDay).toBe(9); // default
  });

  it('merges location rules over org rules', () => {
    const r = parseOperatingHours(
      { businessHoursStart: '06:00', businessHoursEnd: '20:00', activeDaysOfWeek: [0, 1] },
      { businessHoursEnd: '23:00' },
    );
    expect(r!.start).toBe('06:00');
    expect(r!.end).toBe('23:00'); // location override wins
  });
});
