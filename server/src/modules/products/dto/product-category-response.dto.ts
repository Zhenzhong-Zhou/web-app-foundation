import type { ProductType } from '../../../database/schema';

/**
 * Items' categories as the API returns them (ADR-068, ADR-092), described
 * for the OpenAPI document by the CLI plugin.
 */

/**
 * How many items of one type a category holds itself, not counting those
 * in the categories under it: the active ones and the discontinued apart,
 * as the list shows them apart.
 */
export class CategoryItemCount {
  type!: ProductType;
  active!: number;
  discontinued!: number;
}

/**
 * One category of the tree, flat: the client nests it by `parentId`, as
 * it does locations.
 */
export class ProductCategory {
  id!: string;
  name!: string;
  /** Null at the top. */
  parentId!: string | null;
  /** Each type it holds items of, in the types' order; none when empty. */
  items!: CategoryItemCount[];
}

/** GET /products/categories: the tree, in name order. */
export class ProductCategoryList {
  categories!: ProductCategory[];
}

/** POST /products/categories: the category as the tree shows it. */
export class ProductCategoryEnvelope {
  category!: ProductCategory;
}
