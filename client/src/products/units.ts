import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from 'react-intl';

import { displayQuantity, formatQuantity } from '../lib/format';

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
/**
 * A unit after a quantity, in the form the quantity takes: "1 box", "600
 * boxes", "600 unités", "600 个". Every language has every unit as a
 * plural message, so a translator can give a form wherever the language
 * has one; abbreviations and Chinese keep a single one.
 */
const COUNTED = defineMessages({
  each: {
    id: 'products.unitCount.each',
    defaultMessage: '{count, plural, other {each}}',
  },
  kg: {
    id: 'products.unitCount.kg',
    defaultMessage: '{count, plural, other {kg}}',
  },
  g: {
    id: 'products.unitCount.g',
    defaultMessage: '{count, plural, other {g}}',
  },
  litre: {
    id: 'products.unitCount.litre',
    defaultMessage: '{count, plural, one {litre} other {litres}}',
  },
  ml: {
    id: 'products.unitCount.ml',
    defaultMessage: '{count, plural, other {ml}}',
  },
  case: {
    id: 'products.unitCount.case',
    defaultMessage: '{count, plural, one {case} other {cases}}',
  },
  box: {
    id: 'products.unitCount.box',
    defaultMessage: '{count, plural, one {box} other {boxes}}',
  },
  pallet: {
    id: 'products.unitCount.pallet',
    defaultMessage: '{count, plural, one {pallet} other {pallets}}',
  },
});

/**
 * The unit's word for this quantity. The quantity is read as a number
 * here only to choose the word's form, singular or plural; the figure
 * shown is always the string, through formatQuantity or displayQuantity,
 * never this number (ADR-025).
 */
function countedUnit(quantity: string, unit: string, intl: IntlShape): string {
  return unit in COUNTED
    ? intl.formatMessage(
        // One descriptor of eight, each taking a count; the union of their
        // inferred types does not, so it is named as a plain descriptor.
        COUNTED[unit as keyof typeof COUNTED] as MessageDescriptor,
        {
          count: Number(quantity),
        },
      )
    : unit;
}

/** The unit's name on its own, as a column, an option or a field's hint. */
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
  return `${formatQuantity(quantity)} ${countedUnit(quantity, unit, intl)}`;
}

/**
 * A quantity to read, with its unit: "400 each", no padding zeros, grouped
 * the language's way (displayQuantity, ADR-055). withUnit stays for where
 * the exact four places matter.
 */
export function displayWithUnit(
  quantity: string,
  unit: string,
  intl: IntlShape,
): string {
  return `${displayQuantity(quantity)} ${countedUnit(quantity, unit, intl)}`;
}
