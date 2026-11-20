import { describe, expect, it } from 'vitest';

import type { Movement } from '../api/types.gen';
import { movement } from '../test/factories';
import { describeMovement, movementActor } from './describe-movement';

/** A movement between these ends, each a place's id and its name. */
function between(
  from: [string, string | null] | null,
  to: [string, string | null] | null,
): Movement {
  return movement({
    fromLocationId: from?.[0] ?? null,
    fromLocationName: from?.[1] ?? null,
    toLocationId: to?.[0] ?? null,
    toLocationName: to?.[1] ?? null,
  });
}

describe('describeMovement', () => {
  it('shows a transfer as both ends, unsigned', () => {
    expect(
      describeMovement(between(['a', 'Shelf A'], ['b', 'Shelf B'])),
    ).toEqual({ sign: '', where: 'Shelf A → Shelf B' });
  });

  it('signs stock arriving with a plus', () => {
    expect(describeMovement(between(null, ['a', 'Shelf A']))).toEqual({
      sign: '+',
      where: 'Shelf A',
    });
  });

  it('signs stock leaving with a minus', () => {
    expect(describeMovement(between(['a', 'Shelf A'], null))).toEqual({
      sign: '−',
      where: 'Shelf A',
    });
  });

  // A reader without locations.view gets each place's id and no name
  // (ADR-093, 96a): the sign still says which way it went.
  it('signs by the ends’ ids for a reader who sees no place’s name', () => {
    expect(describeMovement(between(['a', null], ['b', null]))).toEqual({
      sign: '',
      where: '—',
    });
    expect(describeMovement(between(null, ['a', null]))).toEqual({
      sign: '+',
      where: '—',
    });
    expect(describeMovement(between(['a', null], null))).toEqual({
      sign: '−',
      where: '—',
    });
  });
});

describe('movementActor', () => {
  function by(actorName: string | null, actorEmail: string | null): Movement {
    return movement({ actorName, actorEmail });
  }

  // Who by name, their email beneath, as the audit log shows them (#256).
  it('gives the name with the email beneath it', () => {
    expect(
      movementActor(by('王建国', 'wang@example.com'), 'Deleted user'),
    ).toEqual({ name: '王建国', email: 'wang@example.com' });
  });

  it('gives the email alone for an account with no name', () => {
    expect(movementActor(by(null, 'wang@example.com'), 'Deleted user')).toEqual(
      { name: 'wang@example.com', email: null },
    );
  });

  // The server keeps an anonymised account's stored name, which is English,
  // and nulls its email (ADR-012): the reader's own words say it instead,
  // marked removed so a browser translating the page may translate them
  // (#245).
  it('says a removed account in the reader’s words, not its stored name', () => {
    expect(movementActor(by('Deleted User', null), 'Deleted user')).toEqual({
      name: 'Deleted user',
      email: null,
      removed: true,
    });
  });
});
