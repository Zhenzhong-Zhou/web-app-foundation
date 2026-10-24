import { describe, expect, it } from 'vitest';

import {
  BRAND,
  CHOSEN_WEIGHT,
  DARK,
  DARK_ACCENT_WEIGHT,
  LIGHT,
  mix,
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

const SCHEMES: ['light' | 'dark', Scheme][] = [
  ['light', LIGHT],
  ['dark', DARK],
];

/**
 * MUI 9's tints for an entry's state (createPalette), which the theme
 * leaves as they are: under the pointer, under the keyboard, selected.
 */
const STATES = {
  light: { overlay: '#000000', hover: 0.04, focus: 0.12, selected: 0.08 },
  dark: { overlay: '#FFFFFF', hover: 0.08, focus: 0.12, selected: 0.16 },
} as const;

/**
 * ADR-060's six presets, the default first, as accent.test.ts has them. No
 * one is the worst everywhere: in light mode the darkest, Charcoal, and in
 * dark mode, mixed toward white, Blue.
 */
const ACCENTS = [
  BRAND.accent,
  '#1F5FBF',
  '#0F6E6E',
  '#2F5D50',
  '#7A3B69',
  '#3A4150',
];

/** An accent as a colour mode draws it. */
const accentIn = (mode: 'light' | 'dark', accent: string) =>
  mode === 'dark' ? towardWhite(accent, DARK_ACCENT_WEIGHT) : accent;

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

  it('lays a tint over its ground', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#5546B8', '#FFFFFF', 0)).toBe('#FFFFFF');
  });

  it.each(SCHEMES)('keeps %s text readable on a chosen card', (name, s) => {
    for (const accent of ACCENTS) {
      const chosen = mix(accentIn(name, accent), s.surface, CHOSEN_WEIGHT);
      expect(contrast(s.text, chosen)).toBeGreaterThanOrEqual(AA);
      expect(contrast(s.muted, chosen)).toBeGreaterThanOrEqual(AA);
    }
  });

  // A bell entry or a button holding a muted line, under the pointer; and
  // tinted the same way, Home's welcome note and a numbering series'
  // helper row (#196).
  it.each(SCHEMES)(
    'keeps %s muted text readable under the pointer',
    (name, s) => {
      const { overlay, hover } = STATES[name];
      const ground = mix(overlay, s.surface, hover);
      expect(contrast(s.muted, ground)).toBeGreaterThanOrEqual(AA);
    },
  );

  // Muted text falls below AA on some of these, so the theme draws it in
  // the main text colour there (mutedAsMain, #196).
  it.each(SCHEMES)(
    'keeps %s main text readable on a focused or selected option',
    (name, s) => {
      const { overlay, hover, focus, selected } = STATES[name];
      for (const brand of ACCENTS) {
        const accent = accentIn(name, brand);
        for (const ground of [
          mix(overlay, s.surface, hover),
          // An option or a menu entry the keyboard is on.
          mix(overlay, s.surface, focus),
          mix(accent, s.surface, selected),
          mix(accent, s.surface, selected + hover),
          mix(accent, s.surface, selected + focus),
        ]) {
          expect(contrast(s.text, ground)).toBeGreaterThanOrEqual(AA);
        }
      }
    },
  );

  it.each(SCHEMES)('keeps every %s status tone readable', (_, s) => {
    for (const tone of Object.values(s.tones)) {
      expect(contrast(tone.fg, tone.bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  // Off its chip too, such as Home's line for a card with nothing to do
  // (ADR-081).
  it.each(SCHEMES)('keeps every %s tone’s text readable on panels', (_, s) => {
    for (const tone of Object.values(s.tones)) {
      expect(contrast(tone.fg, s.surface)).toBeGreaterThanOrEqual(AA);
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
