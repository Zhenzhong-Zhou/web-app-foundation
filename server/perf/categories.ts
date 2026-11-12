/**
 * The two categories Items' filter is timed at (ADR-051, amended for
 * #547), written once for `npm run perf` and `npm run perf:plans`.
 */

import type { ProductCategory } from '../src/modules/products/dto/product-category-response.dto';

/** The part of a category of `GET /products/categories` the pick reads. */
export type PickableCategory = Pick<
  ProductCategory,
  'id' | 'parentId' | 'items'
>;

export interface PickedCategories {
  /** The top-level category with the most items beneath it, itself included. */
  top: string;
  /**
   * The bottom-level category under it with the most items: one with no
   * category beneath it, so its filter reads that category alone. Undefined
   * when the top has none under it.
   */
  bottom: string | undefined;
}

/**
 * The top-level category whose branch holds the most items, so its filter
 * reads the most, and the bottom-level category under it with the most
 * items. A tie goes to the first in the order given, the tree's name order,
 * so the same seed picks the same two. Undefined when there are no
 * categories.
 */
export function pickCategories(
  tree: readonly PickableCategory[],
): PickedCategories | undefined {
  const childrenOf = (id: string) =>
    tree.filter((each) => each.parentId === id);

  const own = (category: PickableCategory): number =>
    category.items.reduce(
      (sum, kept) => sum + kept.active + kept.discontinued,
      0,
    );

  const branch = (category: PickableCategory): number =>
    own(category) +
    childrenOf(category.id).reduce((sum, child) => sum + branch(child), 0);

  const bottomsUnder = (category: PickableCategory): PickableCategory[] => {
    const children = childrenOf(category.id);

    return children.length === 0
      ? []
      : children.flatMap((child) =>
          childrenOf(child.id).length === 0 ? [child] : bottomsUnder(child),
        );
  };

  const mostOf = (
    categories: PickableCategory[],
    count: (category: PickableCategory) => number,
  ): PickableCategory | undefined =>
    categories.reduce<PickableCategory | undefined>(
      (best, each) => (!best || count(each) > count(best) ? each : best),
      undefined,
    );

  const top = mostOf(
    tree.filter((each) => !each.parentId),
    branch,
  );
  if (!top) return undefined;

  return { top: top.id, bottom: mostOf(bottomsUnder(top), own)?.id };
}
