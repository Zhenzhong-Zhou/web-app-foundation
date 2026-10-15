/**
 * Where the idle sign-out leaves its reason for the sign-in page, and
 * where this browser remembers Keep me signed in (ADR-065).
 */
export const SIGNED_OUT_REASON = 'waf.signedOutReason';
export const KEEP_SIGNED_IN = 'waf.keepSignedIn';

/**
 * Which organization's deletion banner this browser hid, for which day,
 * and until when (ADR-070, amended): hidden for today only.
 */
export const HIDDEN_DELETION_BANNER = 'waf.hiddenDeletionBanner';

/**
 * The email the reset page opens with, after Reset your password beside a
 * refused password signs this tab out: taken once, then removed.
 */
export const RESET_PASSWORD_EMAIL = 'waf.resetPasswordEmail';
