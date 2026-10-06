import { defineMessages, type IntlShape } from 'react-intl';

import { formatQuantity } from '../lib/format';

/**
 * What a variant's stock is counted in. Stored as these keys, so a unit is
 * the same row in every language; what it is called is the reader's
 * (ADR-054). The English names are the keys themselves, as they always
 * read.
 */
export const UNITS = [
  'each',
  'kg',
  'g',
  'litre',
  'ml',
  'case',
  'box',
  'pallet',
] as const;

const LABELS = defineMessages({
  each: { id: 'products.unit.each', defaultMessage: 'each' },
  kg: { id: 'products.unit.kg', defaultMessage: 'kg' },
  g: { id: 'products.unit.g', defaultMessage: 'g' },
  litre: { id: 'products.unit.litre', defaultMessage: 'litre' },
  ml: { id: 'products.unit.ml', defaultMessage: 'ml' },
  case: { id: 'products.unit.case', defaultMessage: 'case' },
  box: { id: 'products.unit.box', defaultMessage: 'box' },
  pallet: { id: 'products.unit.pallet', defaultMessage: 'pallet' },
});

/** A unit's name; one this client does not know is shown as it came. */
export function unitLabel(unit: string, intl: IntlShape): string {
  return unit in LABELS
    ? intl.formatMessage(LABELS[unit as keyof typeof LABELS])
    : unit;
}

/**
 * "35,0000 kg" in French, "35.0000 kg" in English: a quantity as the
 * language writes its decimals (formatQuantity, never through a number),
 * then its unit by name. One string, so it reads the same in a table cell,
 * a sentence or a tooltip.
 */
export function withUnit(
  quantity: string,
  unit: string,
  intl: IntlShape,
): string {
  return `${formatQuantity(quantity)} ${unitLabel(unit, intl)}`;
}
