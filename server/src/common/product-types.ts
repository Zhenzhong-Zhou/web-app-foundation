import type { ProductType } from '../database/schema';
import { t, type Translatable } from '../i18n/translate';

/**
 * Each item's type in everyday words, as Items' tabs name them (ADR-092):
 * the catalogue export's Type column and History's type, from and to. A
 * value no longer listed reads as it was stored.
 */
export const PRODUCT_TYPE_WORDS: Record<ProductType, Translatable> = {
  good: t({ id: 'products.type.good', defaultMessage: 'Products' }),
  material: t({
    id: 'products.type.material',
    defaultMessage: 'Raw materials',
  }),
  packaging: t({ id: 'products.type.packaging', defaultMessage: 'Packaging' }),
  supply: t({ id: 'products.type.supply', defaultMessage: 'Supplies' }),
  sample: t({ id: 'products.type.sample', defaultMessage: 'Samples' }),
  equipment: t({ id: 'products.type.equipment', defaultMessage: 'Equipment' }),
};
