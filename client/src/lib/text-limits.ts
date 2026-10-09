/**
 * How wide a name may grow beside a face before it is cut with "…", whole
 * on hover; the email beneath it is cut at the name's width, never less
 * than the floor, so a short name's email stays readable (ADR-063). The
 * same in every list and menu.
 */
export const EMAIL_MAX_WIDTH = 200;
export const EMAIL_MIN_WIDTH = 140;
