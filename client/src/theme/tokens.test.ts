import { describe, expect, it } from 'vitest';

import {
  BRAND,
  DARK,
  DARK_ACCENT_WEIGHT,
  LIGHT,
  ON_ACCENT,
  RAILS,
  type Scheme,
  towardWhite,
} from './tokens';

/** One sRGB channel, 0 to 255, as WCAG 2.2 linearises it. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const r = linear(value >> 16);
  const g = linear((value >> 8) & 255);
  const b = linear(value & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** AA for normal text. Every pair here is read at body or chip size. */
const AA = 4.5;

const SCHEMES: [string, Scheme][] = [
  ['light', LIGHT],
  ['dark', DARK],
];

describe('tokens (ADR-055)', () => {
  it('works out the dark accent by mixing toward white', () => {
    expect(towardWhite('#000000', 0.5)).toBe('#808080');
    expect(towardWhite('#5546B8', 0)).toBe('#5546B8');
  });

  it('keeps text on the accent readable in both modes', () => {
    expect(contrast(BRAND.accent, ON_ACCENT.light)).toBeGreaterThanOrEqual(AA);

    const dark = towardWhite(BRAND.accent, DARK_ACCENT_WEIGHT);
    expect(contrast(dark, ON_ACCENT.dark)).toBeGreaterThanOrEqual(AA);
    // The dark accent is also link text on a dark surface.
    expect(contrast(dark, DARK.surface)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SCHEMES)('keeps %s text readable on every surface', (_, s) => {
    for (const ground of [s.page, s.surface, s.head]) {
      expect(contrast(s.text, ground)).toBeGreaterThanOrEqual(AA);
      expect(contrast(s.muted, ground)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(SCHEMES)('keeps every %s status tone readable', (_, s) => {
    for (const tone of Object.values(s.tones)) {
      expect(contrast(tone.fg, tone.bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(SCHEMES)('keeps %s coloured text readable on panels', (_, s) => {
    for (const colour of Object.values(s.intents)) {
      expect(contrast(colour, s.surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('keeps every sidebar readable, in both shades and both modes', () => {
    for (const shade of Object.values(RAILS)) {
      for (const rail of [shade.light, shade.dark]) {
        expect(contrast(rail.text, rail.bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(rail.strong, rail.bg)).toBeGreaterThanOrEqual(AA);
        expect(contrast(rail.muted, rail.bg)).toBeGreaterThanOrEqual(AA);
      }
    }
  });
});
