import { Client } from 'pg';

export interface Captured {
  probe: string;
  text: string;
  values: unknown[];
}

/**
 * Records the SQL the real services send, so the plan check explains the
 * queries the app runs rather than copies of them.
 *
 * A copy written into a script agrees with itself while the service drifts
 * away from it; the recorded text cannot. Every query, pooled or inside a
 * transaction, goes through pg's Client#query, so wrapping that one method
 * sees them all. Only reads are kept: begin and commit are not queries, and
 * the advisory locks some reads take are not what an index would serve.
 *
 * For this script's process only, never imported by the app.
 */
export class QueryCapture {
  private probe: string | null = null;
  readonly statements: Captured[] = [];

  install(): void {
    // Unbound on purpose: it is called below with apply(this, …).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Client.prototype.query as (
      this: Client,
      ...args: unknown[]
    ) => unknown;
    const record = (config: unknown, values: unknown) =>
      this.record(config, values);

    Client.prototype.query = function (this: Client, ...args: unknown[]) {
      record(args[0], args[1]);
      return original.apply(this, args);
    } as unknown as typeof Client.prototype.query;
  }

  /** Records what `fn` sends, under the probe's name. */
  async during<T>(probe: string, fn: () => Promise<T>): Promise<T> {
    this.probe = probe;
    try {
      return await fn();
    } finally {
      this.probe = null;
    }
  }

  private record(config: unknown, values: unknown) {
    if (!this.probe) return;

    const query =
      typeof config === 'string'
        ? { text: config, values }
        : (config as { text?: string; values?: unknown } | null);

    if (!query?.text || !/^\s*(select|with)\b/i.test(query.text)) return;
    if (/pg_advisory/i.test(query.text)) return;

    this.statements.push({
      probe: this.probe,
      text: query.text,
      values: Array.isArray(query.values) ? (query.values as unknown[]) : [],
    });
  }
}
