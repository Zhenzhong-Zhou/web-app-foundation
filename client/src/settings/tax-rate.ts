import { intl } from '../i18n/intl';
import { formatQuantity } from '../lib/format';
import type { TaxCode } from '../lib/types';

/**
 * "5.0000" as "5%". The server sends numeric(7,4) as a string, so the
 * trailing zeros are stripped as text rather than through a number, which
 * could not tell 9.975 from 9.97499999.
 */
export function formatRate(rate: string): string {
  // "9.975%" in English, "9,975 %" in French (ADR-054).
  return intl().formatMessage(
    { id: 'settings.tax.rate', defaultMessage: '{value}%' },
    { value: rateNumber(rate) },
  );
}

/** "5.0000" as "5", "9.9750" as "9,975" in French: the number alone. */
export function rateNumber(rate: string): string {
  const trimmed = rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
  return formatQuantity(trimmed);
}

/** "GST 5% + PST 7%", or "Nothing" for an exempt code. */
export function describeCharges(code: TaxCode): string {
  if (code.components.length === 0) {
    return intl().formatMessage({
      id: 'settings.tax.exempt',
      defaultMessage: 'Nothing — exempt',
    });
  }

  return code.components
    .map((component) => `${component.name} ${formatRate(component.rate)}`)
    .join(' + ');
}
