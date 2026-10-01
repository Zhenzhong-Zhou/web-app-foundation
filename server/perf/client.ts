/**
 * Talking to a running server the way the browser does: a session cookie
 * from signing in, and the X-Requested-With header the CSRF guard asks of
 * every state-changing request.
 *
 * Node's own fetch, so perf installs nothing (ADR-051). Its default agent
 * keeps connections alive and opens as many as there are requests in
 * flight, which is what "10 connections" needs to mean.
 */

/** No request waits longer than this; a hung request is an error, not data. */
const TIMEOUT_MS = 30_000;

export interface ApiResponse {
  status: number;
  text: string;
}

/**
 * The server throttled us. Not a measurement: every number after the first
 * 429 is the limiter's, so the run stops and says how to raise the limit.
 */
export class RateLimited extends Error {
  constructor(path: string) {
    super(
      `${path} answered 429. Start the server with RATE_LIMIT_MAX raised ` +
        '(perf/README.md), or the numbers measure the rate limiter.',
    );
  }
}

export class Session {
  constructor(
    readonly baseUrl: string,
    private readonly cookie: string,
    /** Which organization this session belongs to, for messages. */
    readonly label: string,
  ) {}

  async send(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        cookie: this.cookie,
        'x-requested-with': 'perf',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Read in full: the response is not finished until its body is, and an
    // unread body holds the connection open.
    const text = await response.text();

    if (response.status === 429) throw new RateLimited(path);

    return { status: response.status, text };
  }

  /** For set-up and checks, where anything but success is a failed run. */
  async json<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.send(method, path, body);

    if (response.status >= 300) {
      throw new Error(
        `${this.label}: ${method} ${path} answered ${response.status}: ${response.text.slice(0, 300)}`,
      );
    }

    return (response.text ? JSON.parse(response.text) : undefined) as T;
  }
}

export async function signIn(
  baseUrl: string,
  email: string,
  password: string,
  label: string,
): Promise<Session> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'perf',
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error(
      `Signing in as ${email} answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }

  await response.text();

  // Only name=value goes back; the attributes are instructions to a browser.
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');

  return new Session(baseUrl, cookie, label);
}

/** A calendar day, the way a date input sends one: today unless offset. */
export function calendarDay(daysFromNow = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}
