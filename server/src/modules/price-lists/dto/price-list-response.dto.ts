import type { PriceListDirection } from '../../../database/schema';

/**
 * Price lists as the API returns them (ADR-068, ADR-049), described for
 * the OpenAPI document by the CLI plugin.
 */

/** A price list, as the list page and the pickers show it. */
export class PriceList {
  id!: string;
  name!: string;
  direction!: PriceListDirection;
  currency!: string;
  isActive!: boolean;
  itemCount!: number;
}

/** GET /price-lists. */
export class PriceListList {
  priceLists!: PriceList[];
}

/** One item's price on a list. */
export class PriceListItem {
  variantId!: string;
  sku!: string;
  /** The item's name, from the catalogue beside the SKU. */
  description!: string;
  unitOfMeasure!: string;
  /** Per unit, net of tax, in the list's currency. */
  unitPrice!: string;
  updatedAt!: Date;
}

/** One list with every price on it. */
export class PriceListDetail {
  id!: string;
  name!: string;
  direction!: PriceListDirection;
  currency!: string;
  isActive!: boolean;
  items!: PriceListItem[];
}

/** Reading or creating a list: the list as it now is. */
export class PriceListEnvelope {
  priceList!: PriceListDetail;
}

/** PUT /price-lists/:id/items/:variantId: the item as the list shows it. */
export class PriceListItemEnvelope {
  item!: PriceListItem;
}
