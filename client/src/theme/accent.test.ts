import { describe, expect, it } from 'vitest';

import { contrast, darkAccent, nearStatus, safeAccent } from './accent';

/** The same cases as server/src/core/organizations/accent.spec.ts. */
describe('safeAccent', () => {
  it('keeps each preset as it is', () => {
    for (const preset of [
      '#5546B8',
      '#1F5FBF',
      '#0F6E6E',
      '#2F5D50',
      '#7A3B69',
      '#3A4150',
    ]) {
      expect(safeAccent(preset)).toEqual({ accent: preset, adjusted: false });
    }
  });

  it('darkens a pale colour to the nearest shade that reads', () => {
    const { accent, adjusted } = safeAccent('#5BB8F0');
    expect(adjusted).toBe(true);
    expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkAccent(accent), '#10141A')).toBeGreaterThanOrEqual(4.5);
    // Still a blue: only the lightness moved.
    expect(accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(accent).not.toBe('#5BB8F0');
  });

  it('lightens a colour too dark for dark mode', () => {
    const { accent, adjusted } = safeAccent('#000000');
    expect(adjusted).toBe(true);
    expect(contrast(darkAccent(accent), '#10141A')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('nearStatus', () => {
  it('warns of a red beside the error tone, not of the presets', () => {
    expect(nearStatus('#D93A2B')).toBe('error');
    expect(nearStatus('#5546B8')).toBeNull();
    expect(nearStatus('#2F5D50')).toBeNull();
  });
});
