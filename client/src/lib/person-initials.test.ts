import { describe, expect, it, vi } from 'vitest';

import {
  colourOf,
  initialsLang,
  initialsOf,
  organizationInitialsOf,
} from './person-initials';

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
    expect(initialsOf('张伟 David')).toBe('DA');
    expect(initialsOf('王芳 (Fiona)')).toBe('FI');
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
  ['张伟 David', 'DA'],
  ['王芳 (Fiona)', 'FI'],
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

describe('organizationInitialsOf', () => {
  it('takes the first two Chinese characters of a name that starts in Chinese', () => {
    expect(organizationInitialsOf('海港草本有限公司')).toBe('海港');
    expect(organizationInitialsOf('青禾贸易')).toBe('青禾');
    expect(organizationInitialsOf('海港 Herbs')).toBe('海港');
    expect(organizationInitialsOf('海')).toBe('海');
  });

  it('takes the first letters of the first two words otherwise', () => {
    expect(organizationInitialsOf('Reid Supply Co.')).toBe('RS');
    expect(organizationInitialsOf('harbour herbs ltd')).toBe('HH');
    expect(organizationInitialsOf('Élan Vital')).toBe('ÉV');
  });

  it('takes one letter for a name of one word, and a question mark for none', () => {
    expect(organizationInitialsOf('Acme')).toBe('A');
    expect(organizationInitialsOf('  ')).toBe('?');
  });

  // The folded rail's plate (ADR-082): an ending every company shares
  // never stands as an initial.
  it('leaves out a legal ending', () => {
    expect(organizationInitialsOf('WIDE Naturals Inc.')).toBe('WN');
    expect(organizationInitialsOf('清禾药业有限公司')).toBe('清禾');
    expect(organizationInitialsOf('Acme Inc.')).toBe('A');
    expect(organizationInitialsOf('Acme, LLC')).toBe('A');
    expect(organizationInitialsOf('Herbes Boréales Ltée')).toBe('HB');
    expect(organizationInitialsOf('Smith Co. Ltd')).toBe('S');
    expect(organizationInitialsOf('Kräuter GmbH')).toBe('K');
    expect(organizationInitialsOf('禾有限公司')).toBe('禾');
    expect(organizationInitialsOf('禾股份有限公司')).toBe('禾');
    // A name that is no more than an ending keeps it.
    expect(organizationInitialsOf('Inc.')).toBe('I');
    expect(organizationInitialsOf('有限公司')).toBe('有限');
    // Only at the end: a company named for one keeps the word.
    expect(organizationInitialsOf('Co Op Foods')).toBe('CO');
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
