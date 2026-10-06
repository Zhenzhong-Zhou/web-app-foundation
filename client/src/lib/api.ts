import { intl } from '../i18n/intl';

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

/**
 * What a failed request says to the person who made it: the server's own
 * message, or one fixed line when no answer came back at all. One definition,
 * so a dropped connection reads the same on every screen.
 *
 * Login and register add rate-limit wording on top (authMessageFor), and
 * forgot-password keeps its own, which must not repeat what the server says.
 */
export function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : intl().formatMessage({
        id: 'common.serverUnreachable',
        defaultMessage: 'Could not reach the server.',
      });
}

/**
 * How long a 429 says to wait, in seconds, from the throttler's Retry-After.
 *
 * The throttler sends whole seconds (ADR-011). The header may also carry an
 * HTTP date by the standard, and nothing here sends one, so anything that is
 * not a positive number of seconds reads as unknown rather than as a guess.
 */
function retryAfter(response: Response): number | undefined {
  if (response.status !== 429) return undefined;

  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : undefined;
}

/** Narrower than RequestInit: a Headers instance spreads to nothing below. */
/**
 * The language the screens speak, sent with every request so the server
 * answers in it (ADR-054): a refusal reads in the same language as the
 * screen it lands on. Set by LanguageProvider when the language changes;
 * the browser's own Accept-Language until then.
 */
let requestLanguage: string | null = null;

export function setRequestLanguage(locale: string): void {
  requestLanguage = locale;
}

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
      ...(requestLanguage ? { 'Accept-Language': requestLanguage } : {}),
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
      : (body?.message ??
        intl().formatMessage(
          {
            id: 'common.requestFailed',
            defaultMessage: 'Request failed ({status})',
          },
          { status: response.status },
        ));

    throw new ApiError(
      message,
      response.status,
      body?.requestId,
      retryAfter(response),
    );
  }

  // 204 from logout and reset-password: no body to parse (ADR-011, ADR-017).
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
