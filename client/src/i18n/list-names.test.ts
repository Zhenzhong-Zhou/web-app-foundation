import { describe, expect, it } from 'vitest';

import { ENGLISH } from './catalogues';
import { makeIntl } from './intl';
import { listNameParts, listNames } from './list-names';

const chinese = makeIntl('zh-Hans', ENGLISH);

/**
 * Names in the reader's language, and in Chinese a space between a Latin
 * name and 和 or 或 (ADR-090, #501).
 */
describe('listNames', () => {
  it('spaces two Latin names from 或 and 和 in Chinese', () => {
    const names = ['Mei Lin', 'David Park'];

    expect(listNames(chinese, names, 'disjunction')).toBe(
      'Mei Lin 或 David Park',
    );
    expect(listNames(chinese, names, 'conjunction')).toBe(
      'Mei Lin 和 David Park',
    );
  });

  it('runs two Chinese names into 或 and 和', () => {
    const names = ['李明', '王芳'];

    expect(listNames(chinese, names, 'disjunction')).toBe('李明或王芳');
    expect(listNames(chinese, names, 'conjunction')).toBe('李明和王芳');
  });

  it('spaces only the side a Latin name is on, and never 、', () => {
    expect(listNames(chinese, ['李明', 'David Park'], 'disjunction')).toBe(
      '李明或 David Park',
    );
    expect(
      listNames(chinese, ['Owner', 'Olu Ade', '王芳'], 'conjunction'),
    ).toBe('Owner、Olu Ade 和王芳');
  });

  it('lists as English and French do, unchanged', () => {
    const names = ['Mei Lin', 'David Park', 'Ada Byrne'];

    expect(listNames(makeIntl('en', ENGLISH), names, 'disjunction')).toBe(
      'Mei Lin, David Park or Ada Byrne',
    );
    expect(listNames(makeIntl('fr-CA', ENGLISH), names, 'disjunction')).toBe(
      'Mei Lin, David Park ou Ada Byrne',
    );
  });

  it('draws each name as asked, the words between kept', () => {
    expect(
      listNameParts(
        chinese,
        ['Mei Lin', 'David Park'],
        'disjunction',
        (name) => ({
          name,
        }),
      ),
    ).toEqual([{ name: 'Mei Lin' }, ' 或 ', { name: 'David Park' }]);
  });
});
