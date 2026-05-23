import { SCHEDULE_TEMPLATES, getTemplate } from '../../src/modules/templates/schedule-templates';

describe('SCHEDULE_TEMPLATES data integrity', () => {
  it('has 13 templates', () => {
    expect(SCHEDULE_TEMPLATES).toHaveLength(13);
  });

  it('all templates have required fields', () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.name).toBeTruthy();
      expect(tpl.emoji).toBeTruthy();
      expect(tpl.color).toBeTruthy();
      expect(tpl.industry).toBeTruthy();
      expect(Array.isArray(tpl.roles)).toBe(true);
      expect(tpl.roles.length).toBeGreaterThan(0);
      expect(Array.isArray(tpl.shifts)).toBe(true);
      expect(tpl.shifts.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate IDs', () => {
    const ids = SCHEDULE_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all industry values are English (no Hebrew)', () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      // Hebrew chars are in range ֐-׿
      expect(tpl.industry).not.toMatch(/[֐-׿]/);
    }
  });

  it('all shift daysOfWeek values are 0-6', () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      for (const shift of tpl.shifts) {
        for (const day of shift.daysOfWeek) {
          expect(day).toBeGreaterThanOrEqual(0);
          expect(day).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('all shifts reference roles defined in template.roles', () => {
    for (const tpl of SCHEDULE_TEMPLATES) {
      for (const shift of tpl.shifts) {
        expect(tpl.roles).toContain(shift.role);
      }
    }
  });

  it('includes the 5 new templates', () => {
    const ids = SCHEDULE_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('kindergarten');
    expect(ids).toContain('school');
    expect(ids).toContain('homecare');
    expect(ids).toContain('events');
    expect(ids).toContain('garage');
  });

  describe('getTemplate()', () => {
    it('returns template by id', () => {
      const tpl = getTemplate('restaurant');
      expect(tpl?.name).toBe('מסעדה / קפה');
    });

    it('returns undefined for unknown id', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });
  });
});
