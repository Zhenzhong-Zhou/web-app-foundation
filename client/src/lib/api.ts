import { API_REVISION } from '../api/revision.gen';
import type { ErrorCode, ErrorDetails } from '../api/types.gen';
import { intl } from '../i18n/intl';
import {
  newVersionNow,
  noteOutdated,
  noteServed,
} from '../version/version-check';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  /** From the exception filter. The only thing tying a user's report to a log line. */
  readonly requestId?: string;
  /** Seconds, from the throttler's Retry-After header on a 429. */
  readonly retryAfterSeconds?: number;
  /**
   * What the refusal is, when the server says: one of the generated
   * ErrorCode, read with hasCode below. The message is for the person and
   * changes with the language; a screen that offers a way out keys on this
   * instead.
   */
  readonly code?: string;
  /**
   * What a few codes carry for the screen to act on, such as the least
   * next number a numbering refusal accepts (ADR-073).
   */
  readonly details?: ErrorDetails;

  constructor(
    message: string,
    status: number,
    requestId?: string,
    retryAfterSeconds?: number,
    code?: string,
    details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
    this.details = details;
  }
}

/**
 * Whether a refusal carries a code (conventions.md, "Error codes"). The
 * code is typed by the generated ErrorCode (ADR-068), so a screen keying on
 * one the server no longer sends fails to compile, rather than offering a
 * way out that never appears.
 */
export function hasCode(errorCode: string | null, code: ErrorCode): boolean {
  return errorCode === code;
}

/**
 * Whether a refusal is about this tab's API revision rather than what it
 * sent (ADR-081): `client_outdated`, the tab older than the API, or
 * `api_updating`, the API not yet deployed or rolled back. Nothing was
 * read, so a page refused this way shows why rather than an error.
 */
export function isRevisionRefusal(caught: unknown): caught is ApiError {
  return (
    caught instanceof ApiError &&
    (hasCode(caught.code ?? null, 'client_outdated') ||
      hasCode(caught.code ?? null, 'api_updating'))
  );
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
  if (!(caught instanceof ApiError)) {
    return intl().formatMessage({
      id: 'common.serverUnreachable',
      defaultMessage: 'Could not reach the server.',
    });
  }
  // Outdated while the version file still names this tab's build: the API
  // deployed first, and a reload would load the same build, so the words
  // are the 503's until the new version is out (ADR-081).
  if (
    hasCode(caught.code ?? null, 'client_outdated') &&
    !newVersionNow().newer
  ) {
    return intl().formatMessage({
      id: 'version.installing',
      defaultMessage:
        'A new version is being installed. Try again in a minute; nothing was saved.',
    });
  }
  return caught.message;
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
 * Every request carries the session cookie, the CSRF header and the API
 * revision this client was built for.
 *
 * `credentials: 'include'` is redundant same-origin — fetch has defaulted to
 * 'same-origin' for years. It is set so that pointing BASE at another origin
 * fails loudly on CORS rather than quietly sending requests with no session.
 *
 * X-Requested-With satisfies ADR-014: presence is the proof, the value is
 * never read. Sent on every method, because a conditional default is a
 * conditional someone eventually gets wrong.
 *
 * X-Api-Revision lets the API refuse a tab open across a deploy that
 * changed it, before anything is read (ADR-081).
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await send(path, init);

  // 204 from logout and reset-password: no body to parse (ADR-011, ADR-017).
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

/**
 * A file the server sends as an attachment, saved by the browser under the
 * name the server gives it (ADR-057's exports). Errors arrive as JSON and
 * are thrown as ApiError, as api() throws them.
 */
export async function download(path: string): Promise<void> {
  const response = await send(path, {});
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export.csv';

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The address of an API route, for a plain link the browser follows
 * itself: a large file it should save straight to disk rather than hold
 * in the page, as download() does (ADR-070's export).
 */
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

/**
 * The path with each parameter given added, after its own `?` when it
 * already asks something; as it is when none is given.
 */
export function withQuery(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const given = Object.entries(params).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  if (given.length === 0) return path;
  const query = new URLSearchParams(given).toString();
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

/** The request every call makes, and the error every failure throws. */
async function send(path: string, init: ApiInit): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(requestLanguage ? { 'Accept-Language': requestLanguage } : {}),
      // A file goes as multipart, whose boundary the browser writes itself.
      ...(init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      'X-Requested-With': 'XMLHttpRequest',
      'X-Api-Revision': String(API_REVISION),
      ...init.headers,
    },
  });

  if (!response.ok) {
    // ValidationPipe returns message as an array; everything else as a string.
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      requestId?: string;
      code?: string;
      details?: ErrorDetails;
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

    const error = new ApiError(
      message,
      response.status,
      body?.requestId,
      retryAfter(response),
      body?.code,
      body?.details,
    );
    // Here once rather than in each caller, since most refusals land in a
    // silent catch, the background session read first of all: the version
    // file read, and a newer build made urgent, before the screen hears.
    if (hasCode(error.code ?? null, 'client_outdated')) await noteOutdated();
    throw error;
  }

  noteServed();
  return response;
}
