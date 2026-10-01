import { inVariantOrder } from './availability';

const A = '019a0000-0000-7000-8000-00000000000a';
const B = '019a0000-0000-7000-8000-00000000000b';
const C = '019a0000-0000-7000-8000-00000000000c';

/**
 * The order every caller touching several products takes its locks in.
 * Two transactions agree on it only if it depends on the ids alone.
 */
describe('inVariantOrder', () => {
  it('sorts by variant id, whatever order the items came in', () => {
    const lines = [
      { lineId: '1', variantId: C },
      { lineId: '2', variantId: A },
      { lineId: '3', variantId: B },
    ];

    const ordered = inVariantOrder(lines, (line) => line.variantId);

    expect(ordered.map((line) => line.lineId)).toEqual(['2', '3', '1']);
  });

  it('gives two callers the same order from opposite inputs', () => {
    const forwards = inVariantOrder([A, B, C], (id) => id);
    const backwards = inVariantOrder([C, B, A], (id) => id);

    expect(forwards).toEqual(backwards);
  });

  it('returns a sorted copy and leaves the input as it was', () => {
    const ids = [C, A, B];

    inVariantOrder(ids, (id) => id);

    expect(ids).toEqual([C, A, B]);
  });
});
