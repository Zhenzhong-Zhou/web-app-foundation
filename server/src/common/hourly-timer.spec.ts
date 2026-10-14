import { Injectable, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockInstance } from 'vitest';

import { HourlyTimer } from './hourly-timer';

const HOUR = 60 * 60 * 1000;

@Injectable()
class Probe extends HourlyTimer {
  readonly run = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

describe('HourlyTimer', () => {
  let error: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
    vi.useRealTimers();
  });

  it('runs at start, then once an hour', async () => {
    const timer = new Probe();

    timer.start();
    expect(timer.run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(timer.run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(timer.run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(timer.run).toHaveBeenCalledTimes(3);
  });

  it('logs a run that fails, and runs again the next hour', async () => {
    const timer = new Probe();
    timer.run.mockRejectedValueOnce(new Error('storage unreachable'));

    timer.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(error).toHaveBeenCalledWith(
      'Run failed',
      expect.stringContaining('storage unreachable'),
    );

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(timer.run).toHaveBeenCalledTimes(2);
  });

  it('stops at shutdown', async () => {
    const timer = new Probe();

    timer.start();
    timer.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(2 * HOUR);

    expect(timer.run).toHaveBeenCalledTimes(1);
  });

  // What the tests and the seed scripts do: boot the modules, never listen.
  it('does not start when the application boots', async () => {
    const app = await Test.createTestingModule({
      providers: [Probe],
    }).compile();

    await app.init();
    await vi.advanceTimersByTimeAsync(2 * HOUR);

    expect(app.get(Probe).run).not.toHaveBeenCalled();
    await app.close();
  });
});
