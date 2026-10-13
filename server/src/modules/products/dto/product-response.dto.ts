import type { Locale } from '../../../common/locales';

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

/** A row of the product list, with its cover. */
export class ProductSummary extends Product {
  /** Its cover (ADR-062), or null. */
  coverFileId!: string | null;
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

export class ProductDetail extends Product {
  translations!: ProductTranslation[];
  variants!: Variant[];
  /** Its gallery, the cover first. */
  images!: ProductImage[];
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

/** The flat variant list behind any picker (ADR-023). */
export class VariantOption {
  id!: string;
  sku!: string;
  variantName!: string | null;
  productName!: string;
  type!: string;
  unitOfMeasure!: string;
  tracksLots!: boolean;
}
