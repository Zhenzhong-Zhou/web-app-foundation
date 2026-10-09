/**
 * An organization's accent colour, made safe (ADR-060): the server's
 * server/src/core/organizations/accent.ts, kept here for the Branding
 * tab's preview. The two packages share no code, so each keeps it with
 * the same tests; the server's is the one that decides what is saved.
 *
 * A colour passes when, in both colour modes, text on it and it as text
 * read at WCAG AA (4.5 : 1): white text on the accent and the accent on
 * white in light mode; in dark mode the accent mixed 45% toward white
 * (ADR-055), with dark text on it and as text on the dark surface. One that
 * fails is moved along its own hue, keeping its chroma where the colour
 * space allows, to the nearest lightness that passes.
 */

const AA = 4.5;
const WHITE = '#FFFFFF';
/** ADR-055's text on a dark-mode accent, and its dark page. */
const ON_DARK_ACCENT = '#10141A';
const DARK_PAGE = '#161A21';
const DARK_ACCENT_WEIGHT = 0.45;

/** The status tones' hues (ADR-055): error, warning, success. */
const STATUS = {
  error: '#B42318',
  warning: '#8A5300',
  success: '#1E6B3E',
} as const;
export type StatusTone = keyof typeof STATUS;

/** `#RRGGBB`, upper case, or null when it is not one. */
export function normalizeHex(value: string): string | null {
  const hex = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

/**
 * The shade to use for a chosen colour: the colour itself when it passes,
 * else the nearest that does, and whether it had to move.
 */
export function safeAccent(hex: string): { accent: string; adjusted: boolean } {
  if (passes(hex)) return { accent: hex, adjusted: false };

  const [lightness, chroma, hue] = toOklch(hex);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (let step = 0; step <= 1000; step++) {
    const candidate = fromOklch(step / 1000, chroma, hue);
    const distance = Math.abs(step / 1000 - lightness);
    if (distance < bestDistance && passes(candidate)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // A chroma too strong to pass at any lightness: the same hue, quieter.
  if (!best) return safeAccent(fromOklch(lightness, chroma / 2, hue));
  return { accent: best, adjusted: true };
}

/**
 * The status tone a colour sits close to, if any: within 25° of its hue at
 * a strong chroma. A warning to show, never a refusal.
 */
export function nearStatus(hex: string): StatusTone | null {
  const [, chroma, hue] = toOklch(hex);
  if (chroma < 0.08) return null;
  for (const [tone, toneHex] of Object.entries(STATUS) as [
    StatusTone,
    string,
  ][]) {
    const difference = Math.abs(hue - toOklch(toneHex)[2]) % 360;
    if (Math.min(difference, 360 - difference) <= 25) return tone;
  }
  return null;
}

/** ADR-055's dark-mode accent: the colour mixed toward white. */
export function darkAccent(hex: string): string {
  return toHex(
    channels(hex).map((value) => value + (1 - value) * DARK_ACCENT_WEIGHT),
  );
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function passes(hex: string): boolean {
  const dark = darkAccent(hex);
  return (
    contrast(hex, WHITE) >= AA &&
    contrast(dark, ON_DARK_ACCENT) >= AA &&
    contrast(dark, DARK_PAGE) >= AA
  );
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function toHex(values: number[]): string {
  return `#${values
    .map((value) =>
      Math.round(Math.min(Math.max(value, 0), 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function linear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encoded(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** OKLCH: lightness 0–1, chroma, hue in degrees. */
function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return [lightness, Math.hypot(a, bb), hue];
}

function fromOklch(lightness: number, chroma: number, hue: number): string {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(encoded),
  );
}
