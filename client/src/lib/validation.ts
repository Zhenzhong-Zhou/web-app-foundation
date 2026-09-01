/**
 * Mirrors the server's DTOs. Stated, never authoritative — anything the
 * browser enforces is bypassed by curl, and the 400 is the real control.
 *
 * Extracted rather than repeated because these are now used by three forms.
 * If they ever drift, drift *looser* than the server: a looser rule produces
 * a 400 the user can act on, a stricter one rejects a valid password with no
 * server message to explain it.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 100;

/** auth_tokens are 32 random bytes base64url — 43 characters. */
export const TOKEN_MIN_LENGTH = 20;
export const TOKEN_MAX_LENGTH = 200;

export function looksLikeToken(value: string | null): value is string {
  return (
    value !== null &&
    value.length >= TOKEN_MIN_LENGTH &&
    value.length <= TOKEN_MAX_LENGTH
  );
}
