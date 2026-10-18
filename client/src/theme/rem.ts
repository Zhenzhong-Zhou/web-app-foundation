/**
 * px to rem against the browser's 16px, as MUI sizes its type (ADR-055).
 *
 * Whatever is sized this way grows with the browser's font size and with
 * the person's text size (ADR-075); a width in px stays put while the text
 * inside it grows, and cuts or squeezes it. So a width that holds text, a
 * field, a label column, a panel or a flex basis, is written with this.
 * Spacing, borders and icon-only boxes stay in px.
 */
export const rem = (px: number) => `${px / 16}rem`;
