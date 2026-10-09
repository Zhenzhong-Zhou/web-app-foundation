import { describe, expect, it } from 'vitest';

import { colourOf, initialsOf } from './person-initials';

describe('initialsOf', () => {
  it('takes the first and last names, or the email', () => {
    expect(initialsOf('Mei Lin')).toBe('ML');
    expect(initialsOf('Arjun Kumar Patel')).toBe('AP');
    expect(initialsOf('Bob')).toBe('BO');
    expect(initialsOf('', 'mo.li@example.com')).toBe('MO');
  });
});

describe('colourOf', () => {
  it('gives the same name the same colour, whatever its case', () => {
    expect(colourOf('Mei Lin')).toBe(colourOf('mei lin'));
    expect(colourOf('Mei Lin')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
