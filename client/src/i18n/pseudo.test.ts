import {
  isStructurallySame,
  type MessageFormatElement,
  parse,
} from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import { ENGLISH } from './catalogues';
import { makeIntl } from './intl';
import { pseudoMessage, pseudoMessages } from './pseudo';

/** A message in en-XA, formatted as the screens would. */
function shown(
  english: string,
  values?: Record<string, string | number | ((chunks: string[]) => string)>,
): string {
  const intl = makeIntl('en', { m: pseudoMessage(parse(english)) });
  // A message made here, not one of the app's to extract with its English.
  const made = { id: 'm' };
  return intl.formatMessage(made, values);
}

/** The letters a message's text holds, its longest branch where several. */
function letters(elements: MessageFormatElement[]): number {
  return elements.reduce((sum, element) => {
    if ('children' in element) return sum + letters(element.children);
    if ('options' in element) {
      return (
        sum +
        Math.max(
          ...Object.values(element.options).map(({ value }) => letters(value)),
        )
      );
    }
    return sum + (element.type === 0 ? element.value.length : 0);
  }, 0);
}

/**
 * en-XA (ADR-054's November 2026 amendment, R9): English with accents,
 * about 40 % longer and bracketed at each end, every placeholder, plural
 * and tag kept.
 */
describe('pseudoMessage', () => {
  it('accents each letter that has a mark, lengthens by words and brackets it', () => {
    expect(shown('Sign in')).toBe('[Šíğñ íñ one]');
    expect(shown('Keep me signed in')).toBe('[Ķéép mé šíğñéď íñ one two]');
  });

  it('keeps placeholders, plurals and tags, so each still formats', () => {
    expect(
      shown('Welcome to {organization}, {name}', {
        organization: 'Acme',
        name: 'Wang Fang',
      }),
    ).toBe('[Ŵéĺçómé ťó Acme, Wang Fang one two]');
    expect(
      shown('{count, plural, one {# item} other {# items}}', { count: 3 }),
    ).toBe('[3 íťémš one]');
    expect(
      shown('Read <b>Help</b> first', {
        b: (chunks) => `*${chunks.join('')}*`,
      }),
    ).toBe('[Ŕéáď *Ĥéĺp* fíŕšť one two]');
  });

  it('leaves an empty message empty', () => {
    expect(pseudoMessage([])).toEqual([]);
  });
});

describe('pseudoMessages', () => {
  const pseudo = pseudoMessages(ENGLISH);

  it('has every English message, with the same placeholders, plurals and tags', () => {
    expect(Object.keys(pseudo)).toEqual(Object.keys(ENGLISH));
    for (const [id, english] of Object.entries(ENGLISH)) {
      expect(isStructurallySame(english, pseudo[id]), id).toEqual({
        success: true,
      });
    }
  });

  it('makes every message with text about 40 % longer', () => {
    for (const [id, english] of Object.entries(ENGLISH)) {
      const before = letters(english);
      if (before === 0) continue;
      const after = letters(pseudo[id]);
      expect(after, id).toBeGreaterThanOrEqual(before * 1.4 + 2);
      expect(after, id).toBeLessThanOrEqual(before * 1.4 + 10);
    }
  });
});
