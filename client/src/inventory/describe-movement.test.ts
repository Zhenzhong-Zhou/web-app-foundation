import { describe, expect, it } from 'vitest';

import type { Movement } from '../lib/types';
import { describeMovement } from './describe-movement';

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
