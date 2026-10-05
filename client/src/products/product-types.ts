import { defineMessages, type IntlShape } from 'react-intl';

/**
 * What a product is for (ADR-023), in the order the create dialog offers
 * them. The server's vocabulary; what each is called is the reader's
 * language (ADR-054).
 */
export const PRODUCT_TYPES = [
  'good',
  'material',
  'packaging',
  'sample',
  'supply',
  'equipment',
] as const;

const LABELS = defineMessages({
  good: { id: 'products.type.good', defaultMessage: 'Sellable good' },
  material: { id: 'products.type.material', defaultMessage: 'Raw material' },
  packaging: { id: 'products.type.packaging', defaultMessage: 'Packaging' },
  sample: { id: 'products.type.sample', defaultMessage: 'Sample' },
  supply: { id: 'products.type.supply', defaultMessage: 'Office supply' },
  equipment: { id: 'products.type.equipment', defaultMessage: 'Equipment' },
});

/** A type's name; a value this client does not know is shown as it came. */
export function productTypeLabel(type: string, intl: IntlShape): string {
  return type in LABELS
    ? intl.formatMessage(LABELS[type as keyof typeof LABELS])
    : type;
}
