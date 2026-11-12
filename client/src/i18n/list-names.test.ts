import { describe, expect, it } from 'vitest';

import { ENGLISH } from './catalogues';
import { makeIntl } from './intl';
import { listNameParts } from './list-names';

/** Each name drawn as asked, the join's words between kept (#501). */
describe('listNameParts', () => {
  it('draws each name, its words spaced in Chinese as makeIntl spaces them', () => {
    expect(
      listNameParts(
        makeIntl('zh-Hans', ENGLISH),
        ['Mei Lin', 'David Park'],
        { type: 'disjunction' },
        (name, index) => ({ name, index }),
      ),
    ).toEqual([
      { name: 'Mei Lin', index: 0 },
      ' 或 ',
      { name: 'David Park', index: 1 },
    ]);
  });

  it('keeps the names in their order, in English and French', () => {
    const names = ['Mei Lin', 'David Park', 'Ada Byrne'];
    const drawn = (tag: string) =>
      listNameParts(
        makeIntl(tag, ENGLISH),
        names,
        { type: 'disjunction' },
        (name) => [name],
      );

    expect(drawn('en')).toEqual([
      ['Mei Lin'],
      ', ',
      ['David Park'],
      ' or ',
      ['Ada Byrne'],
    ]);
    expect(drawn('fr-CA')).toEqual([
      ['Mei Lin'],
      ', ',
      ['David Park'],
      ' ou ',
      ['Ada Byrne'],
    ]);
  });
});
