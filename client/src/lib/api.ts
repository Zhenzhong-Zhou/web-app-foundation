const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  /** From the exception filter. The only thing tying a user's report to a log line. */
  readonly requestId?: string;
  /** Seconds, from the throttler's Retry-After header on a 429. */
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    requestId?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Narrower than RequestInit: a Headers instance spreads to nothing below. */
type ApiInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

/**
 * Every request carries the session cookie and the CSRF header.
 *
 * `credentials: 'include'` is redundant same-origin — fetch has defaulted to
 * 'same-origin' for years. It is set so that pointing BASE at another origin
 * fails loudly on CORS rather than quietly sending requests with no session.
 *
 * X-Requested-With satisfies ADR-014: presence is the proof, the value is
 * never read. Sent on every method, because a conditional default is a
 * conditional someone eventually gets wrong.
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...init.headers,
    },
  });
  
  if (!response.ok) {
    // ValidationPipe returns message as an array; everything else as a string.
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      requestId?: string;
    } | null;
    
    const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : (body?.message ?? `Request failed (${response.status})`);
    
    throw new ApiError(message, response.status, body?.requestId);
  }
  
  // 204 from logout and reset-password: no body to parse (ADR-011, ADR-017).
  return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
}
