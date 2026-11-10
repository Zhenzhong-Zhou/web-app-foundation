import CleaningServicesOutlined from '@mui/icons-material/CleaningServicesOutlined';
import GrainOutlined from '@mui/icons-material/GrainOutlined';
import HandymanOutlined from '@mui/icons-material/HandymanOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import RedeemOutlined from '@mui/icons-material/RedeemOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import type { SvgIconProps } from '@mui/material';
import type { ComponentType } from 'react';
import { defineMessages, type IntlShape } from 'react-intl';

import type { ProductType } from '../lib/api-names';
import type { ItemTab } from './item-list';

/**
 * What a product is for (ADR-023), in the order Items' tabs and Add item
 * offer them (ADR-092), not the schema's, which puts Samples before
 * Supplies. The server's vocabulary; what each is called is the reader's
 * language (ADR-054).
 */
export const PRODUCT_TYPES = [
  'good',
  'material',
  'packaging',
  'supply',
  'sample',
  'equipment',
] as const satisfies readonly ProductType[];

const LABELS = defineMessages({
  good: { id: 'products.type.good', defaultMessage: 'Products' },
  material: { id: 'products.type.material', defaultMessage: 'Raw materials' },
  packaging: { id: 'products.type.packaging', defaultMessage: 'Packaging' },
  sample: { id: 'products.type.sample', defaultMessage: 'Samples' },
  supply: { id: 'products.type.supply', defaultMessage: 'Supplies' },
  equipment: { id: 'products.type.equipment', defaultMessage: 'Equipment' },
});

/** A type's name; a value this client does not know is shown as it came. */
export function productTypeLabel(type: string, intl: IntlShape): string {
  return type in LABELS
    ? intl.formatMessage(LABELS[type as keyof typeof LABELS])
    : type;
}

/** An Items tab's name: a type's, or All (ADR-092). */
export function itemTabLabel(tab: ItemTab, intl: IntlShape): string {
  return tab === 'all'
    ? intl.formatMessage({ id: 'products.tab.all', defaultMessage: 'All' })
    : productTypeLabel(tab, intl);
}

/** What each type is, in everyday words, a line under its name (ADR-092). */
const LINES = defineMessages({
  good: {
    id: 'products.type.good.line',
    defaultMessage: 'What you sell to customers',
  },
  material: {
    id: 'products.type.material.line',
    defaultMessage: 'Used up in production',
  },
  packaging: {
    id: 'products.type.packaging.line',
    defaultMessage: 'Bottles, boxes and labels',
  },
  supply: {
    id: 'products.type.supply.line',
    defaultMessage: 'Used up by the company, such as gloves',
  },
  sample: {
    id: 'products.type.sample.line',
    defaultMessage: 'Given away, not sold',
  },
  equipment: {
    id: 'products.type.equipment.line',
    defaultMessage: 'Machines and tools, never sold or used up',
  },
});

export function productTypeLine(type: ProductType, intl: IntlShape): string {
  return intl.formatMessage(LINES[type]);
}

/** Whether a value is one of the six, as an address or an answer gives it. */
export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}

/**
 * Each type's icon, the tile an item with no image shows in a list
 * (ADR-062, #306's 22); a value this client does not know has the box.
 */
const ICONS: Record<ProductType, ComponentType<SvgIconProps>> = {
  good: SellOutlined,
  material: GrainOutlined,
  packaging: Inventory2Outlined,
  sample: RedeemOutlined,
  supply: CleaningServicesOutlined,
  equipment: HandymanOutlined,
};

export function productTypeIcon(type: string): ComponentType<SvgIconProps> {
  return type in ICONS ? ICONS[type as keyof typeof ICONS] : Inventory2Outlined;
}
