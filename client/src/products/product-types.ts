import CleaningServicesOutlined from '@mui/icons-material/CleaningServicesOutlined';
import GrainOutlined from '@mui/icons-material/GrainOutlined';
import HandymanOutlined from '@mui/icons-material/HandymanOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import RedeemOutlined from '@mui/icons-material/RedeemOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import type { SvgIconProps } from '@mui/material';
import type { ComponentType } from 'react';
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

/**
 * Each type's icon, the tile an item with no image shows in a list
 * (ADR-062, #306's 22); a value this client does not know has the box.
 */
const ICONS: Record<
  (typeof PRODUCT_TYPES)[number],
  ComponentType<SvgIconProps>
> = {
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
