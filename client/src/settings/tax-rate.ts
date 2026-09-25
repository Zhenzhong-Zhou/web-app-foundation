import type { TaxCode } from '../lib/types';

/**
 * "5.0000" as "5%". The server sends numeric(7,4) as a string, so the
 * trailing zeros are stripped as text rather than through a number, which
 * could not tell 9.975 from 9.97499999.
 */
export function formatRate(rate: string): string {
  const trimmed = rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
  return `${trimmed}%`;
}

/** "GST 5% + PST 7%", or "Nothing" for an exempt code. */
export function describeCharges(code: TaxCode): string {
  if (code.components.length === 0) return 'Nothing — exempt';

  return code.components
    .map((component) => `${component.name} ${formatRate(component.rate)}`)
    .join(' + ');
}
