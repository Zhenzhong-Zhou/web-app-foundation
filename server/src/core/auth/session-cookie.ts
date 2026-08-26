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
