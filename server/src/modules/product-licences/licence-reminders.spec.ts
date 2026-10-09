import { daysUntil, noticeDue } from './licence-reminders.service';

describe('licence reminders', () => {
  it('counts calendar days', () => {
    expect(daysUntil('2026-12-08', '2026-10-09')).toBe(60);
    expect(daysUntil('2026-10-09', '2026-10-09')).toBe(0);
    expect(daysUntil('2026-10-02', '2026-10-09')).toBe(-7);
  });

  it('owes the nearest notice reached, and nothing outside the window', () => {
    expect(noticeDue(61)).toBeNull();
    expect(noticeDue(60)).toBe(60);
    expect(noticeDue(45)).toBe(60);
    expect(noticeDue(30)).toBe(30);
    // A week asleep: the 7-day notice, not the 30 and the 7 together.
    expect(noticeDue(5)).toBe(7);
    expect(noticeDue(0)).toBe(0);
    expect(noticeDue(-3)).toBe(0);
    expect(noticeDue(-8)).toBeNull();
  });
});
