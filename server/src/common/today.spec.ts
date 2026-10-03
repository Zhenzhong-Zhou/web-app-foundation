import { todayUtc } from './today';

/**
 * The server's today is the UTC day (ADR-052), wherever the process runs and
 * however the database is configured.
 */
describe('todayUtc', () => {
  it('is the UTC day, as YYYY-MM-DD', () => {
    expect(todayUtc(new Date('2026-10-02T15:00:00.000Z'))).toBe('2026-10-02');
  });

  // 5pm on 2 October in Vancouver is 00:00 on 3 October in UTC.
  it('turns over at midnight UTC, not local midnight', () => {
    expect(todayUtc(new Date('2026-10-02T23:59:59.999Z'))).toBe('2026-10-02');
    expect(todayUtc(new Date('2026-10-03T00:00:00.000Z'))).toBe('2026-10-03');
    expect(todayUtc(new Date('2026-10-02T17:00:00.000-07:00'))).toBe(
      '2026-10-03',
    );
  });
});
