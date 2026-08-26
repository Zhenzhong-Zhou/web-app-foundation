import type { CookieOptions } from 'express';

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
