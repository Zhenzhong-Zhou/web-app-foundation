import type { Locale } from '../../../common/locales';
import type { ProductType } from '../../../database/schema';
import type { ItemStockStatus } from '../../stock/item-stock';

/**
 * Products as the API returns them (ADR-068), described for the OpenAPI
 * document by the CLI plugin: the fields the client reads, and not the
 * organization a product belongs to or the pinyin kept for search.
 */

export class Product {
  id!: string;
  /** What it is: finished goods, a raw material, packaging (ADR-023). */
  type!: string;
  name!: string;
  description!: string | null;
  isActive!: boolean;
}

/** A row's category: its id, and its path from the top. */
export class ProductSummaryCategory {
  id!: string;
  /** The categories above it from the top, then its own name. */
  path!: string[];
}

/**
 * A row of Items' list (ADR-092): what a person decides by, named for the
 * reader. `displayName` alone, not `name`, which is the base wherever the
 * API sends it (#306's 36).
 */
export class ProductSummary {
  id!: string;
  type!: ProductType;
  /** Its name in the reader's language (ADR-056). */
  displayName!: string;
  /** Its first code, in the codes' order, a number by its value. */
  sku!: string;
  /** How many variants it has, discontinued ones included. */
  variantCount!: number;
  /** Its category, or null: Uncategorised. */
  category!: ProductSummaryCategory | null;
  /** Its cover (ADR-062), or null. */
  coverFileId!: string | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  /**
   * On hand in every location, its codes' figures as Inventory reads them
   * (ADR-093), summed in its unit; null where its variants' units differ,
   * which the row shows as its number of variants instead. Never stored
   * on the item.
   */
  onHand!: string | null;
  /**
   * The part of `onHand` not usable: expired, issued to a run, or at a
   * place not available, "72 not usable" (#590); null as `onHand` is.
   */
  notUsable!: string | null;
  /** The unit `onHand` is in; null where the units differ. */
  unitOfMeasure!: string | null;
  /**
   * Its worst code's status, from its reorder points (ADR-085; ADR-093):
   * out where any code is out, else low where any is low; null otherwise,
   * or with no point.
   */
  stockStatus!: ItemStockStatus | null;
  /** How many of its codes share `stockStatus`, "1 of 3 codes"; null without one. */
  stockStatusCodes!: number | null;
}

/** How many items one type's tab shows. */
export class ProductTypeCount {
  type!: ProductType;
  count!: number;
}

/**
 * The list's counts (ADR-092), following its search and its category:
 * each tab's, as the Discontinued and Low stock chips leave the list, and
 * each chip's, with the other on and its own off.
 */
export class ProductCounts {
  /**
   * Each type the organization holds an item of, discontinued ones
   * included, in the types' order: the tabs, kept while a search finds
   * none of a type.
   */
  types!: ProductTypeCount[];
  /** All's: every type's together. */
  all!: number;
  /** The discontinued items on the open tab: the Discontinued chip's. */
  discontinued!: number;
  /**
   * The items low or out on the open tab, as the list leaves the rest:
   * the Low stock chip's (ADR-093, 21a), counting items where Reorder
   * and Home count codes.
   */
  low!: number;
}

/** GET /products: a page of Items' list. */
export class ProductPage {
  entries!: ProductSummary[];
  /** Pass as `cursor` for the next page. Null when there is no more. */
  nextCursor!: string | null;
  /** With the first page; null with the pages after it. */
  counts!: ProductCounts | null;
}

/** A variant's name in one language (ADR-054). */
export class VariantTranslation {
  locale!: Locale;
  name!: string;
}

/** One sellable form of a product: its own SKU and unit (ADR-023). */
export class Variant {
  id!: string;
  sku!: string;
  name!: string | null;
  unitOfMeasure!: string;
  isActive!: boolean;
  tracksLots!: boolean;
  weightGrams!: number | null;
  lengthMm!: number | null;
  widthMm!: number | null;
  heightMm!: number | null;
  caseQuantity!: number | null;
  /**
   * Its name as the reader sees it, in their language where it has one
   * (ADR-056); `name` stays the base, which the edit forms change.
   */
  displayName!: string | null;
  /** Its names in other languages; on the product's detail. */
  translations?: VariantTranslation[];
}

/** A product's name and description in one language (ADR-054). */
export class ProductTranslation {
  locale!: Locale;
  name!: string;
  description!: string | null;
}

/** One size an image is kept in. */
export class StoredImageSize {
  width!: number;
  height!: number;
  bytes!: number;
}

/** The sizes kept: a photo all three, a logo only `full` (ADR-059). */
export class ImageSizes {
  thumb?: StoredImageSize;
  display?: StoredImageSize;
  full?: StoredImageSize;
}

/** One image of a product's gallery (ADR-062). */
export class ProductImage {
  fileId!: string;
  /** From 0; the first is the cover. */
  position!: number;
  sizes!: ImageSizes;
}

/** A name documents will refuse to print without (ADR-054, amended). */
export class MissingName {
  /** The variant's id; null for the item's own name. */
  variantId!: string | null;
  /** The variant's code; null for the item. */
  sku!: string | null;
  /** The language a document requires it in. */
  locale!: Locale;
}

export class ProductDetail extends Product {
  /**
   * Its name as the reader sees it, in their language where it has one
   * (ADR-056); `name` stays the base, which the edit forms change.
   */
  displayName!: string;
  /** Its category (ADR-092), or null: Uncategorised. */
  categoryId!: string | null;
  translations!: ProductTranslation[];
  variants!: Variant[];
  /** Its gallery, the cover first. */
  images!: ProductImage[];
  /**
   * The item's names and its named variants' that documents will refuse
   * to print without, as issuing refuses (#551's 65). None is listed in the
   * language its items are named in. By language, the item before its
   * variants.
   */
  missingNames!: MissingName[];
}

/** POST /products: the product as created, with its first variant. */
export class ProductEnvelope {
  product!: ProductDetail;
}

/** POST /products/:id/variants: the variant as the product shows it. */
export class VariantEnvelope {
  variant!: Variant;
}

/** Adding or ordering a product's images: the gallery as it now is. */
export class ProductImageList {
  images!: ProductImage[];
}

/**
 * The flat variant list behind any picker (ADR-023), named for the reader
 * (ADR-056).
 */
export class VariantOption {
  id!: string;
  sku!: string;
  variantName!: string | null;
  productName!: string;
  type!: string;
  unitOfMeasure!: string;
  tracksLots!: boolean;
}

/**
 * One item's values before several at once changed it (ADR-092): the
 * fields its change named, as they were, so Undo sends them back.
 */
export class ProductChange {
  id!: string;
  /** Its category before, null for Uncategorised; absent when not sent. */
  categoryId?: string | null;
  /** Whether it was in use; absent when not sent. */
  isActive?: boolean;
}

/** PATCH /products: each item's values before, in the order sent. */
export class ProductChanges {
  items!: ProductChange[];
}
