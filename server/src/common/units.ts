import { t, type Translatable } from '../i18n/translate';

/**
 * A unit of measure by name, in each language, as the screens say it: a
 * document's lines and an export's Unit column (#473's 29). Any other
 * unit reads as it was stored.
 */
export const UNIT_WORDS: Record<string, Translatable> = {
  each: t({ id: 'products.unit.each', defaultMessage: 'each' }),
  kg: t({ id: 'products.unit.kg', defaultMessage: 'kg' }),
  g: t({ id: 'products.unit.g', defaultMessage: 'g' }),
  litre: t({ id: 'products.unit.litre', defaultMessage: 'litre' }),
  ml: t({ id: 'products.unit.ml', defaultMessage: 'ml' }),
  case: t({ id: 'products.unit.case', defaultMessage: 'case' }),
  box: t({ id: 'products.unit.box', defaultMessage: 'box' }),
  pallet: t({ id: 'products.unit.pallet', defaultMessage: 'pallet' }),
};
