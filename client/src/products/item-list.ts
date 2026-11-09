import type { ProductCategory, ProductCounts } from '../api/types.gen';

/**
 * What Items' list (ADR-092) knows apart from its screen: its tabs, its
 * sorts, and its category filter's tree, kept out of the components'
 * files so each exports components alone.
 */

/**
 * Items' tabs in the order they show (ADR-092): the six types, Products
 * first, then All. Not the schema's order, which puts Samples before
 * Supplies.
 */
export const ITEM_TABS = [
  'good',
  'material',
  'packaging',
  'supply',
  'sample',
  'equipment',
  'all',
] as const;

export type ItemTab = (typeof ITEM_TABS)[number];

/**
 * A tab's count: the number, `loading` while the first page is read, or
 * `failed` when it could not be, which reads "—", not 0, since nothing is
 * known (decision 18).
 */
export type TabCount = number | 'loading' | 'failed';

/** A tab's count from the first page's counts. */
export function countOf(counts: ProductCounts, tab: ItemTab): number {
  if (tab === 'all') return counts.all;
  return counts.types.find((entry) => entry.type === tab)?.count ?? 0;
}

/** What Items' list sorts by (ADR-092), as the API takes it. */
export const ITEM_SORTS = [
  'name',
  'category',
  'stock',
  'added',
  'changed',
] as const;

export type ItemSort = (typeof ITEM_SORTS)[number];

/** The category filter's word for the items in none, as the API takes it. */
export const UNCATEGORISED = 'uncategorised';

/** Which of a category's items the list shows: as the Discontinued chip. */
export type DiscontinuedShown = '' | 'only' | 'include';

/** A category in the filter: its depth in the tree, and what it holds. */
export interface CategoryOption {
  id: string;
  name: string;
  depth: number;
  /** Its items on the open tab, those in the categories under it too. */
  count: number;
  /** Its names from the top, its own last. */
  path: string[];
}

/**
 * The tree in the filter's order (ADR-092): each category under its
 * parent, by name as the server sends them, each with the items the open
 * tab shows in it and every category under it. Only those holding any,
 * and the one chosen, which stays named while a tab holds none of it.
 */
export function categoryOptions(
  categories: readonly ProductCategory[],
  tab: ItemTab,
  discontinued: DiscontinuedShown,
  chosen: string,
): CategoryOption[] {
  return categoryTree(categories, tab, discontinued).filter(
    (option) => option.count > 0 || option.id === chosen,
  );
}

/**
 * Every category in the tree's order, each under its parent, with its
 * count as the filter's: what Set category offers, an empty one too
 * (ADR-092).
 */
export function categoryTree(
  categories: readonly ProductCategory[],
  tab: ItemTab,
  discontinued: DiscontinuedShown,
): CategoryOption[] {
  const children = new Map<string | null, ProductCategory[]>();
  for (const category of categories) {
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category);
    children.set(category.parentId, siblings);
  }

  const own = (category: ProductCategory) =>
    category.items
      .filter((entry) => tab === 'all' || entry.type === tab)
      .reduce(
        (sum, entry) =>
          sum +
          (discontinued === 'only' ? 0 : entry.active) +
          (discontinued === '' ? 0 : entry.discontinued),
        0,
      );

  const options: CategoryOption[] = [];
  const walk = (
    parentId: string | null,
    depth: number,
    above: string[],
  ): number => {
    let total = 0;
    for (const category of children.get(parentId) ?? []) {
      const path = [...above, category.name];
      const at = options.length;
      options.push({
        id: category.id,
        name: category.name,
        depth,
        count: 0,
        path,
      });
      const count = own(category) + walk(category.id, depth + 1, path);
      options[at].count = count;
      total += count;
    }
    return total;
  };
  walk(null, 0, []);

  return options;
}

/**
 * At most this many items changed at once, as the server takes them
 * (`MAX_CHANGED_AT_ONCE`, ADR-092): past it, the bar says to untick some.
 */
export const MAX_AT_ONCE = 500;

/**
 * A category and every category under it, at any depth: where it cannot
 * be moved, since the branch would hang from nothing (ADR-092). The
 * server refuses it too; Move's list leaves them out, so it is never
 * offered.
 */
export function branchOf(
  categories: readonly ProductCategory[],
  id: string,
): Set<string> {
  const branch = new Set([id]);
  let grew = true;
  // Passes over the flat list until none adds one: a category may come
  // before its parent in it.
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (
        category.parentId &&
        branch.has(category.parentId) &&
        !branch.has(category.id)
      ) {
        branch.add(category.id);
        grew = true;
      }
    }
  }
  return branch;
}
