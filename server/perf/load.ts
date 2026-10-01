import { type ApiResponse, RateLimited } from './client';

/**
 * One request of a scenario. `worker` says which connection is asking, so a
 * scenario can give each one its own organization and fixtures; `n` counts
 * that worker's requests from 0, warm-up included.
 */
export type Send = (worker: number, n: number) => Promise<ApiResponse>;

export interface LoadOptions {
  connections: number;
  /** Timed requests, across all connections. */
  requests: number;
  /** Untimed requests first, so a cold cache or pool is not in the numbers. */
  warmup: number;
}

export interface Stats {
  requests: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Timed requests per second over the timed window. */
  rps: number;
  /** A few distinct failures, as status and the start of the body. */
  errorSamples: string[];
}

/** How many of `total` fall to one worker, spread as evenly as they go. */
export function quota(total: number, workers: number, worker: number): number {
  return Math.floor(total / workers) + (worker < total % workers ? 1 : 0);
}

/**
 * A closed loop: each connection sends its next request as soon as the last
 * one answers, with no pause. That is more load per connection than any
 * person clicking, which is why 10 of them stands for dozens of people
 * (ADR-051).
 *
 * Timed from before fetch to the end of the body, so a slow serializer or a
 * large response counts, as it does for the person waiting.
 */
export async function runLoad(
  send: Send,
  options: LoadOptions,
): Promise<Stats> {
  const durations: number[] = [];
  const samples = new Set<string>();
  let errors = 0;
  let firstStart = Number.POSITIVE_INFINITY;
  let lastEnd = 0;
  let stopped = false;

  async function worker(index: number) {
    const warm = quota(options.warmup, options.connections, index);
    const timed = quota(options.requests, options.connections, index);

    for (let n = 0; n < warm + timed && !stopped; n++) {
      const start = performance.now();
      let failure: string | null = null;

      try {
        const response = await send(index, n);
        if (response.status >= 400) {
          failure = `${response.status} ${response.text.slice(0, 160)}`;
        }
      } catch (error) {
        if (error instanceof RateLimited) {
          stopped = true;
          throw error;
        }
        failure = error instanceof Error ? error.message : String(error);
      }

      const end = performance.now();
      if (n < warm) continue;

      firstStart = Math.min(firstStart, start);
      lastEnd = Math.max(lastEnd, end);
      durations.push(end - start);

      if (failure) {
        errors++;
        if (samples.size < 5) samples.add(failure);
      }
    }
  }

  await Promise.all(
    Array.from({ length: options.connections }, (_, index) => worker(index)),
  );

  durations.sort((a, b) => a - b);
  const seconds = (lastEnd - firstStart) / 1000;

  return {
    requests: durations.length,
    errors,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    max: durations.at(-1) ?? 0,
    rps: seconds > 0 ? durations.length / seconds : 0,
    errorSamples: [...samples],
  };
}

/** Nearest rank: the value at or below which p% of requests finished. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(rank, 1)) - 1];
}

/** Set-up work, a few at a time: untimed, and not a load of its own. */
export async function inParallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => lane()),
  );
}
