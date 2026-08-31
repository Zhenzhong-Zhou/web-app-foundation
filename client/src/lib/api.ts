const BASE = '/api/v1';

/**
 * Every request carries the session cookie and the CSRF header.
 *
 * `credentials: 'include'` is required even same-origin for fetch to send
 * cookies on some browsers. X-Requested-With satisfies ADR-014 — a cross-site
 * form cannot set a header, which is the whole defence.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    // The server's error shape carries a message and a requestId; surfacing
    // the message is what makes a 403 legible to the user.
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;

    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `Request failed (${response.status})`);

    throw new ApiError(message, response.status);
  }

  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
