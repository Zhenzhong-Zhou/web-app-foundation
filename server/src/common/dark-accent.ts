/**
 * ADR-055's dark-mode accent, worked out from a colour rather than chosen,
 * and the text it carries: an organization's accent's (ADR-060,
 * core/organizations/accent.ts) and the emails' (ADR-083) alike. The
 * client's are towardWhite, DARK_ACCENT_WEIGHT and ON_ACCENT.dark in
 * client/src/theme/tokens.ts; the packages share no code, so a change
 * there is made here too.
 */

/** ADR-055's text on a dark-mode accent. */
export const ON_DARK_ACCENT = '#10141A';
const DARK_ACCENT_WEIGHT = 0.45;

/** ADR-055's dark-mode accent: the colour mixed toward white. */
export function darkAccent(hex: string): string {
  return toHex(
    channels(hex).map((value) => value + (1 - value) * DARK_ACCENT_WEIGHT),
  );
}

/** `#RRGGBB`'s red, green and blue, each 0 to 1. */
export function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/** `#RRGGBB`, upper case, from red, green and blue, each 0 to 1. */
export function toHex(values: number[]): string {
  return `#${values
    .map((value) =>
      Math.round(Math.min(Math.max(value, 0), 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}
