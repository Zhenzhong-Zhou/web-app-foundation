import { describe, expect, it, vi } from 'vitest';

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

/** Every expectation above, for the run without Intl.Segmenter. */
const EXPECTED: [
  name: string | null,
  initials: string,
  email?: string | null,
][] = [
  ['Mei Lin', 'ML'],
  ['mei lin', 'ML'],
  ['Arjun Kumar Patel', 'AP'],
  ['Bob', 'BO'],
  ['Élodie Dupré', 'ÉD'],
  ['Олег Петров', 'ОП'],
  ['E\u0301lodie Dupre\u0301', 'E\u0301D'],
  ['周振中', '振中'],
  ['周 振中', '振中'],
  ['欧阳娜娜', '娜娜'],
  ['王芳', '王芳'],
  ['明', '明'],
  ['محمد علي', 'م'],
  ['דוד לוי', 'ד'],
  ['やまだ', 'や'],
  ['🙂 Bob Smith', 'BS'],
  ['(Bob)', 'BO'],
  ['Zhou 振中', 'ZH'],
  ['ßaron Klein', 'ßK'],
  ['', 'MO', 'mo.li@example.com'],
  ['🙂', 'ZO', 'zoe@example.com'],
  [null, '?', null],
];

describe('initialsOf without Intl.Segmenter', () => {
  it('gives the same initials, as in Firefox before 125', async () => {
    // The module looks for Intl.Segmenter when it loads, so it is loaded
    // again under an Intl that has none.
    vi.stubGlobal(
      'Intl',
      Object.assign(Object.create(Intl), { Segmenter: undefined }),
    );
    vi.resetModules();
    try {
      const { initialsOf: withoutSegmenter } =
        await import('./person-initials');
      for (const [name, initials, email] of EXPECTED) {
        expect(withoutSegmenter(name, email), String(name)).toBe(initials);
      }
    } finally {
      vi.unstubAllGlobals();
    }
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
