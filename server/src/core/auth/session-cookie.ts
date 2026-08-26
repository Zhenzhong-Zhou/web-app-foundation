import type { CookieOptions } from 'express';
import type { Request } from 'express';

export const SESSION_COOKIE_NAME = 'sid';

/**
 * Cookie flags from ADR-011. Each is a security control:
 *
 * - httpOnly  : invisible to JavaScript, so an XSS bug cannot steal the session
 * - secure    : never sent over plain HTTP (relaxed only on localhost, which
 *               has no TLS in development)
 * - sameSite  : 'lax' blocks the cross-site POSTs that make up most CSRF.
 *               Not all of it — state-changing routes still need a custom
 *               header or double-submit token.
 * - path '/'  : one session for the whole API
 */
export function sessionCookieOptions(
  expiresAt: Date,
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/**
 * Narrowed rather than read straight off `req.cookies`, which cookie-parser
 * types as `any`. The session guard reads it the same way next step.
 */
export function readSessionCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;

  const value = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Options for clearing the cookie.
 *
 * Browsers match a Set-Cookie against an existing cookie by name, domain, and
 * **path** — a mismatch on path writes a *second* cookie instead of removing
 * the first, and the original stays in the jar. So this must mirror
 * sessionCookieOptions() exactly, minus expiry.
 *
 * Kept as its own function rather than reusing that one with a past date, so
 * that the two cannot drift: a future change to sameSite or path has to be
 * made here too, and the mismatch is visible in one file.
 */
export function clearSessionCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}
