import { pageOf } from './keyset';

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `id-${i + 1}` }));

/**
 * Every list asks for one row more than it shows. That extra row, and only
 * that, says there is another page.
 */
describe('pageOf', () => {
  it('drops the extra row and points the cursor at the last one kept', () => {
    const page = pageOf(rows(4), 3);

    expect(page.entries.map((row) => row.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(page.nextCursor).toBe('id-3');
  });

  /**
   * The case a full page gets wrong: exactly `limit` rows left. Guessing
   * "more" from a full page would offer a Load more that returns nothing.
   */
  it('has no next page when the last page is exactly full', () => {
    const page = pageOf(rows(3), 3);

    expect(page.entries).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('has no next page when fewer rows came back', () => {
    expect(pageOf(rows(2), 3).nextCursor).toBeNull();
    expect(pageOf([], 3)).toEqual({ entries: [], nextCursor: null });
  });
});
