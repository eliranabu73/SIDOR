import { loadScheduleExportData } from '../../src/modules/share/export/data';
import { renderPng } from '../../src/modules/share/export/png-renderer';
import { renderPdf } from '../../src/modules/share/export/pdf-renderer';

describe('schedule export', () => {
  jest.setTimeout(30000);

  it('loadScheduleExportData returns demo fixture for non-uuid id', async () => {
    const data = await loadScheduleExportData(
      'sched_demo',
      '10000000-0000-0000-0000-000000000001',
    );
    expect(data.scheduleId).toBe('sched_demo');
    expect(data.shifts.length).toBeGreaterThan(0);
    expect(data.employees.length).toBeGreaterThan(0);
    expect(data.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('renderPng returns a Buffer starting with PNG signature', async () => {
    const data = await loadScheduleExportData(
      'sched_demo',
      '10000000-0000-0000-0000-000000000001',
    );
    const buf = await renderPng(data, 'branded');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it('renderPng output differs between styles', async () => {
    const data = await loadScheduleExportData(
      'sched_demo',
      '10000000-0000-0000-0000-000000000001',
    );
    const [minimal, branded, dark] = await Promise.all([
      renderPng(data, 'minimal'),
      renderPng(data, 'branded'),
      renderPng(data, 'dark'),
    ]);
    // Different styles should produce different output (at least different sizes).
    const sizes = new Set([minimal.length, branded.length, dark.length]);
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('renderPdf returns a Buffer with %PDF- header', async () => {
    const data = await loadScheduleExportData(
      'sched_demo',
      '10000000-0000-0000-0000-000000000001',
    );
    const buf = await renderPdf(data, 'minimal');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
