import type {
  CategoryItemCount,
  ProductCategory,
  ProductCounts,
} from '../api/types.gen';
import type { DiscontinuedShown, ItemSort } from '../lib/api-names';
import { PRODUCT_TYPES } from './product-types';

/**
 * What Items' list (ADR-092) knows apart from its screen: its tabs, its
 * sorts, and its category filter's tree, kept out of the components'
 * files so each exports components alone.
 */

/**
 * Items' tabs in the order they show (ADR-092): the six types in Add
 * item's order, Products first, then All.
 */
export const ITEM_TABS = [...PRODUCT_TYPES, 'all'] as const;

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
] as const satisfies readonly ItemSort[];

/** The category filter's word for the items in none, as the API takes it. */
export const UNCATEGORISED = 'uncategorised';

/**
 * A category select's value before anything is chosen, where the empty
 * value is a choice of its own, None (Uncategorised): Set category opens
 * on it (ADR-092's review, 13).
 */
export const NOT_CHOSEN = 'not-chosen';

/** A category's path as a person reads it: Packaging › Bottles. */
export function pathName(path: readonly string[]): string {
  return path.join(' › ');
}

/** A category in the tree's order: how deep, and its path from the top. */
export interface CategoryPlace {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  /** Its names from the top, its own last. */
  path: string[];
}

/** A category in the filter, with what it holds. */
export interface CategoryOption extends CategoryPlace {
  /** Its items on the open tab, those in the categories under it too. */
  count: number;
}

/**
 * Every category in the tree's order (ADR-092), each under its parent, by
 * name as the server sends them: what a form's Category offers, an empty
 * one too, and where a path is read from.
 */
export function categoryPlaces(
  categories: readonly ProductCategory[],
): CategoryPlace[] {
  const children = new Map<string | null, ProductCategory[]>();
  for (const category of categories) {
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category);
    children.set(category.parentId, siblings);
  }

  const places: CategoryPlace[] = [];
  const walk = (parentId: string | null, depth: number, above: string[]) => {
    for (const category of children.get(parentId) ?? []) {
      const path = [...above, category.name];
      places.push({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        depth,
        path,
      });
      walk(category.id, depth + 1, path);
    }
  };
  walk(null, 0, []);

  return places;
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
 * How many of a category's own items, or Uncategorised's, the open tab
 * shows, as Discontinued says.
 */
export function itemsShown(
  entries: readonly CategoryItemCount[],
  tab: ItemTab,
  discontinued: DiscontinuedShown,
): number {
  return entries
    .filter((entry) => tab === 'all' || entry.type === tab)
    .reduce(
      (sum, entry) =>
        sum +
        (discontinued === 'only' ? 0 : entry.active) +
        (discontinued === '' ? 0 : entry.discontinued),
      0,
    );
}

/**
 * Every category in the tree's order with its count as the filter's: the
 * items the open tab shows in it and in every category under it.
 */
export function categoryTree(
  categories: readonly ProductCategory[],
  tab: ItemTab,
  discontinued: DiscontinuedShown,
): CategoryOption[] {
  const places = categoryPlaces(categories);
  const items = new Map(
    categories.map((category) => [category.id, category.items]),
  );

  const own = (entries: CategoryItemCount[]) =>
    itemsShown(entries, tab, discontinued);

  // Each place comes after those above it, so from the last back each
  // one's own items are added to what those under it already gave it.
  const counts = new Map<string, number>();
  for (const place of [...places].reverse()) {
    const total = (counts.get(place.id) ?? 0) + own(items.get(place.id)!);
    counts.set(place.id, total);
    if (place.parentId) {
      counts.set(place.parentId, (counts.get(place.parentId) ?? 0) + total);
    }
  }

  return places.map((place) => ({ ...place, count: counts.get(place.id)! }));
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
