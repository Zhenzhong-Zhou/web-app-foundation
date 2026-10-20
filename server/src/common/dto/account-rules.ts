/**
 * The limits on what a person gives for their account, a name and a new
 * password, in one place: every DTO that takes either says the same, and
 * these had already drifted once when each DTO wrote its own
 * (conventions.md, Duplication). The client mirrors them in
 * lib/validation.ts.
 */

/** A person's name, trimmed first: at least one character, at most this. */
export const NAME_MAX_LENGTH = 100;

/**
 * A new password: length only, no composition rules.
 *
 * NIST SP 800-63B advises against mandatory symbol/digit/case requirements:
 * they push people toward predictable patterns (Password1!) without adding
 * real entropy. Length is what matters.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * A denial-of-service guard, not a security limit: argon2 would happily
 * spend seconds hashing a multi-megabyte string. Unlike bcrypt, it does not
 * silently truncate.
 */
export const PASSWORD_MAX_LENGTH = 128;
