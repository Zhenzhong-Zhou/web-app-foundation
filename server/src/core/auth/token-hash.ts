import { createHash, randomBytes } from 'node:crypto';

/**
 * A link's secret and how it is stored, in one place (ADR-017): 32 CSPRNG
 * bytes sent as base64url, and their SHA-256 kept. AuthTokenService issues
 * every link the app makes with these; `npm run org:invite` makes an
 * organization invitation's with them too, outside Nest (ADR-078), so the
 * page finds it by the same hash.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A fast hash is right: there is nothing to guess in 256 random bits, and
 * hashing at all is what makes a database leak useless (ADR-011).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
