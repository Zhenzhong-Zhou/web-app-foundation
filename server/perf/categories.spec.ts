import { type PickableCategory, pickCategories } from './categories';

/** A category holding `active` and `discontinued` items of one type. */
function category(
  id: string,
  parentId: string | null,
  active = 0,
  discontinued = 0,
): PickableCategory {
  return {
    id,
    parentId,
    items: active + discontinued === 0 ? [] : [{ active, discontinued }],
  };
}

describe('pickCategories', () => {
  it('picks the top whose whole branch holds the most items', () => {
    const tree = [
      // 30 items of its own, none beneath.
      category('big-own', null, 30),
      // 5 of its own and 20 + 10 beneath: 35.
      category('wide', null, 5),
      category('wide-a', 'wide', 20),
      category('wide-a-1', 'wide-a', 10),
    ];

    expect(pickCategories(tree)?.top).toBe('wide');
  });

  it('counts the active and the discontinued items both', () => {
    const tree = [category('active', null, 10), category('both', null, 6, 6)];

    expect(pickCategories(tree)?.top).toBe('both');
  });

  it('picks the bottom-level category under the top with the most items', () => {
    const tree = [
      category('top', null),
      category('mid', 'top'),
      category('leaf-1', 'mid', 7),
      category('leaf-2', 'mid', 9),
      // Another top's bottom category holds more than any under the first.
      category('other', null, 1),
      category('other-leaf', 'other', 8),
    ];

    expect(pickCategories(tree)).toEqual({ top: 'top', bottom: 'leaf-2' });
  });

  it('counts a category with nothing beneath it as a bottom, at any depth', () => {
    const tree = [
      category('top', null),
      category('shallow', 'top', 100),
      category('mid', 'top'),
      category('leaf', 'mid', 7),
    ];

    expect(pickCategories(tree)).toEqual({ top: 'top', bottom: 'shallow' });
  });

  it('never picks a category with another beneath it as the bottom', () => {
    const tree = [
      category('top', null),
      // The middle holds the most of its own, but has a leaf beneath it.
      category('mid', 'top', 50),
      category('leaf', 'mid', 3),
    ];

    expect(pickCategories(tree)).toEqual({ top: 'top', bottom: 'leaf' });
  });

  it('breaks a tie by the order given', () => {
    const tree = [
      category('first', null, 4),
      category('second', null, 4),
      category('first-a', 'first', 2),
      category('first-b', 'first', 2),
    ];

    expect(pickCategories(tree)).toEqual({ top: 'first', bottom: 'first-a' });
  });

  it('has no bottom when the top has nothing beneath it', () => {
    expect(pickCategories([category('alone', null, 3)])).toEqual({
      top: 'alone',
      bottom: undefined,
    });
  });

  it('picks nothing from no categories', () => {
    expect(pickCategories([])).toBeUndefined();
  });
});
