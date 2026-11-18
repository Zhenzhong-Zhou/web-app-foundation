import { BadRequestException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { cursorOf, type KeyPart, readKeys } from './sorted-page';

const PARTS: KeyPart[] = [
  { value: sql`on_hand`, type: 'numeric', order: 'desc' },
  { value: sql`name`, type: 'text', order: 'asc' },
  { value: sql`id`, type: 'uuid', order: 'asc' },
];

const ID = '0192f0a4-1c2b-7d3e-8f40-5a6b7c8d9e0f';

/**
 * A list sorted by a worked-out figure carries the last row's values in its
 * cursor, with the order it was made for: read back as they were, and
 * anything else refused as no place in this list.
 */
describe('a cursor of keys', () => {
  it('reads back the values it was made from', () => {
    const cursor = cursorOf('onHand desc en', ['12.5000', 'Fish oil', ID]);

    expect(readKeys(cursor, 'onHand desc en', PARTS)).toEqual([
      '12.5000',
      'Fish oil',
      ID,
    ]);
  });

  it('refuses one made for another order, direction or language', () => {
    const cursor = cursorOf('onHand desc en', ['12.5000', 'Fish oil', ID]);

    for (const order of [
      'onHand asc en',
      'onHand desc fr-CA',
      'name desc en',
    ]) {
      expect(() => readKeys(cursor, order, PARTS)).toThrow(BadRequestException);
    }
  });

  it('refuses values that are not what their parts compare as', () => {
    for (const values of [
      ['a dozen', 'Fish oil', ID],
      ['12.5000', 'Fish oil', 'not-an-id'],
      ['12.5000', 'Fish oil'],
      ['12.5000', 3, ID],
    ]) {
      const cursor = Buffer.from(
        JSON.stringify({ o: 'onHand desc en', v: values }),
      ).toString('base64url');

      expect(() => readKeys(cursor, 'onHand desc en', PARTS)).toThrow(
        BadRequestException,
      );
    }
  });

  it('refuses a cursor not made here', () => {
    for (const cursor of ['not base64 json', '', 'bnVsbA']) {
      expect(() => readKeys(cursor, 'onHand desc en', PARTS)).toThrow(
        BadRequestException,
      );
    }
  });
});
