import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsOptional, validateSync } from 'class-validator';

import { IsCalendarDay } from './calendar-day';

class Probe {
  @IsOptional()
  @IsCalendarDay()
  day?: string | null;
}

function read(day: unknown) {
  const probe = plainToInstance(Probe, { day });
  return {
    day: probe.day,
    errors: validateSync(probe).flatMap((error) =>
      Object.values(error.constraints ?? {}),
    ),
  };
}

/**
 * The one decorator every calendar day goes through (ADR-052). The two
 * modes differ only on an instant at exactly UTC midnight; everything else
 * reads the same under both, which is what lets a deployment switch.
 */
describe('IsCalendarDay', () => {
  const original = process.env.CALENDAR_DAY_INPUT;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
    if (original === undefined) delete process.env.CALENDAR_DAY_INPUT;
    else process.env.CALENDAR_DAY_INPUT = original;
  });

  describe.each(['strict', 'lenient'])('under %s', (mode) => {
    beforeEach(() => {
      process.env.CALENDAR_DAY_INPUT = mode;
    });

    it('takes a calendar day as it arrives', () => {
      expect(read('2026-10-10')).toEqual({ day: '2026-10-10', errors: [] });
    });

    it('refuses a day that does not exist', () => {
      expect(read('2026-02-30').errors).toEqual(['day must be a real date']);
    });

    // 07:00Z is midnight in Vancouver: which day it is depends on a time
    // zone, so neither mode guesses.
    it('refuses an instant that is not UTC midnight', () => {
      expect(read('2026-10-10T07:00:00.000Z').errors).toContain(
        'day must be a calendar day, YYYY-MM-DD',
      );
    });

    it('leaves null to IsOptional, so a day can be cleared', () => {
      expect(read(null)).toEqual({ day: null, errors: [] });
    });
  });

  it('refuses an instant at UTC midnight under strict', () => {
    process.env.CALENDAR_DAY_INPUT = 'strict';

    expect(read('2026-10-10T00:00:00.000Z').errors).toEqual([
      'day must be a calendar day, YYYY-MM-DD',
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads an instant at UTC midnight as its day under lenient, and logs it', () => {
    process.env.CALENDAR_DAY_INPUT = 'lenient';

    expect(read('2026-10-10T00:00:00.000Z')).toEqual({
      day: '2026-10-10',
      errors: [],
    });
    expect(read('2026-10-10T00:00:00Z').day).toBe('2026-10-10');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('is strict when the variable is not set', () => {
    delete process.env.CALENDAR_DAY_INPUT;

    expect(read('2026-10-10T00:00:00.000Z').errors).toHaveLength(1);
  });
});
