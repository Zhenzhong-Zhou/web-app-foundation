import { Client } from 'pg';

/** A statement the app sent, and the connection it went on. */
export interface SentStatement {
  text: string;
  /** The connection: one transaction's statements share it. */
  client: unknown;
}

/**
 * Runs one request and returns what it gave, with every statement the app
 * sent meanwhile, in order. Every statement, pooled or inside a
 * transaction, goes through pg's Client#query, as the plan check records
 * them (perf/capture.ts), so a spy on that one method sees them all. The
 * spy is restored after, whether the request passed or failed.
 *
 * Not perf/capture.ts's QueryCapture, which keeps a whole script's reads
 * and never restores the method.
 */
export async function captureStatements<T>(
  request: () => Promise<T>,
): Promise<{ result: T; statements: SentStatement[] }> {
  const sent = vi.spyOn(Client.prototype, 'query');
  try {
    const result = await request();
    // Read before the spy is restored, which forgets them.
    const statements = sent.mock.calls.map(([config], index) => ({
      text:
        typeof config === 'string'
          ? config
          : ((config as { text?: string } | null)?.text ?? ''),
      client: sent.mock.contexts[index],
    }));
    return { result, statements };
  } finally {
    sent.mockRestore();
  }
}
