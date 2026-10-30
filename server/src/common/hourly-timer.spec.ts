import { Injectable, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockInstance } from 'vitest';

import { reportFault } from './faults/tracker';
import { HourlyTimer } from './hourly-timer';

vi.mock('./faults/tracker', () => ({ reportFault: vi.fn() }));

const HOUR = 60 * 60 * 1000;

@Injectable()
class Probe extends HourlyTimer {
  readonly run = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

describe('HourlyTimer', () => {
  let error: MockInstance;

  beforeEach(() => {
    vi.mocked(reportFault).mockClear();
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

  it('reports a run that fails once, by the job', async () => {
    const timer = new Probe();
    const failure = new Error('storage unreachable');
    timer.run.mockRejectedValueOnce(failure);

    timer.start();
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(reportFault).toHaveBeenCalledTimes(1);
    expect(reportFault).toHaveBeenCalledWith(failure, { job: 'Probe' });
  });

  it('reports a fault that lasts once, and again after a run succeeds', async () => {
    const timer = new Probe();
    timer.run
      .mockRejectedValueOnce(new Error('storage unreachable'))
      .mockRejectedValueOnce(new Error('storage unreachable at 05:00'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unreachable'));

    // Fail, fail: both logged, one report.
    timer.start();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(error).toHaveBeenCalledTimes(2);
    expect(reportFault).toHaveBeenCalledTimes(1);

    // Succeed, fail: reported again.
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(timer.run).toHaveBeenCalledTimes(4);
    expect(reportFault).toHaveBeenCalledTimes(2);
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
