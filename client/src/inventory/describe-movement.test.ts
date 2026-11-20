import { describe, expect, it } from 'vitest';

import type { Movement } from '../api/types.gen';
import { movement } from '../test/factories';
import { movementActor } from './describe-movement';

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
