import { describe, expect, it } from 'vitest';

import { colourOf, initialsLang, initialsOf } from './person-initials';

describe('initialsOf', () => {
  it('takes the first and last names in a cased script', () => {
    expect(initialsOf('Mei Lin')).toBe('ML');
    expect(initialsOf('mei lin')).toBe('ML');
    expect(initialsOf('Arjun Kumar Patel')).toBe('AP');
    expect(initialsOf('Bob')).toBe('BO');
    expect(initialsOf('Élodie Dupré')).toBe('ÉD');
    expect(initialsOf('Олег Петров')).toBe('ОП');
  });

  it('keeps a letter typed with its accent whole', () => {
    // E followed by a combining acute: one character to a reader.
    expect(initialsOf('E\u0301lodie Dupre\u0301')).toBe('E\u0301D');
  });

  it('takes a Chinese given name, or a short name whole', () => {
    expect(initialsOf('周振中')).toBe('振中');
    expect(initialsOf('周 振中')).toBe('振中');
    expect(initialsOf('欧阳娜娜')).toBe('娜娜');
    expect(initialsOf('王芳')).toBe('王芳');
    expect(initialsOf('明')).toBe('明');
  });

  it('takes the first character of any other script', () => {
    expect(initialsOf('محمد علي')).toBe('م');
    expect(initialsOf('דוד לוי')).toBe('ד');
    expect(initialsOf('やまだ')).toBe('や');
  });

  it('skips emoji and brackets, and mixed words outside the script', () => {
    expect(initialsOf('🙂 Bob Smith')).toBe('BS');
    expect(initialsOf('(Bob)')).toBe('BO');
    expect(initialsOf('Zhou 振中')).toBe('ZH');
  });

  it('never makes one letter two when capitalising', () => {
    expect(initialsOf('ßaron Klein')).toBe('ßK');
  });

  it('falls back to the email, then to a question mark', () => {
    expect(initialsOf('', 'mo.li@example.com')).toBe('MO');
    expect(initialsOf('🙂', 'zoe@example.com')).toBe('ZO');
    expect(initialsOf(null, null)).toBe('?');
  });
});

describe('initialsLang', () => {
  it('marks Chinese initials, leaving the rest to the page', () => {
    expect(initialsLang('振中')).toBe('zh');
    expect(initialsLang('ML')).toBeUndefined();
    expect(initialsLang('م')).toBeUndefined();
  });
});

describe('colourOf', () => {
  it('gives the same name the same colour, whatever its case', () => {
    expect(colourOf('Mei Lin')).toBe(colourOf('mei lin'));
    expect(colourOf('Mei Lin')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
