import { describe, expect, it } from 'vitest';

import type { Movement } from '../api/types.gen';
import { describeMovement, movementActor } from './describe-movement';

function movement(
  fromLocationName: string | null,
  toLocationName: string | null,
): Movement {
  return { fromLocationName, toLocationName } as Movement;
}

describe('describeMovement', () => {
  it('shows a transfer as both ends, unsigned', () => {
    expect(describeMovement(movement('Shelf A', 'Shelf B'))).toEqual({
      sign: '',
      where: 'Shelf A → Shelf B',
    });
  });

  it('signs stock arriving with a plus', () => {
    expect(describeMovement(movement(null, 'Shelf A'))).toEqual({
      sign: '+',
      where: 'Shelf A',
    });
  });

  it('signs stock leaving with a minus', () => {
    expect(describeMovement(movement('Shelf A', null))).toEqual({
      sign: '−',
      where: 'Shelf A',
    });
  });
});

describe('movementActor', () => {
  function by(actorName: string | null, actorEmail: string | null): Movement {
    return { actorName, actorEmail } as Movement;
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
  // and nulls its email (ADR-012): the reader's own words say it instead.
  it('says a removed account in the reader’s words, not its stored name', () => {
    expect(movementActor(by('Deleted User', null), 'Deleted user')).toEqual({
      name: 'Deleted user',
      email: null,
    });
  });
});
