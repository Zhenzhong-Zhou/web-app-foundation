import { InternalServerErrorException } from '@nestjs/common';

import type { invoices } from '../../database/schema';
import { t } from '../../i18n/translate';

type Invoice = typeof invoices.$inferSelect;

/** Both parties, copied from the invoice rather than re-read (ADR-046). */
export function partiesOf(invoice: Invoice) {
  return {
    sellerName: invoice.sellerName,
    sellerTaxNumber: invoice.sellerTaxNumber,
    sellerLine1: invoice.sellerLine1,
    sellerLine2: invoice.sellerLine2,
    sellerCity: invoice.sellerCity,
    sellerRegion: invoice.sellerRegion,
    sellerPostalCode: invoice.sellerPostalCode,
    sellerCountry: invoice.sellerCountry,
    billToAddressId: invoice.billToAddressId,
    billToName: invoice.billToName,
    billToLine1: invoice.billToLine1,
    billToLine2: invoice.billToLine2,
    billToCity: invoice.billToCity,
    billToRegion: invoice.billToRegion,
    billToPostalCode: invoice.billToPostalCode,
    billToCountry: invoice.billToCountry,
  };
}

/**
 * The languages the invoice was printed in, copied rather than resolved
 * again (ADR-054), so an invoice and its credit note read as one set even
 * if the partner's setting changed in between.
 */
export function languagesOf(invoice: Invoice) {
  return {
    language: stored(invoice.language, 'language'),
    secondLanguage: invoice.secondLanguage,
  };
}

/**
 * A value an issued invoice always has — its check constraint guarantees
 * it — read from a column typed nullable because drafts leave it empty.
 * Throws rather than inventing a figure if that guarantee is ever broken.
 */
export function stored<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new InternalServerErrorException(
      t(
        {
          id: 'invoices.issuedInvoiceMissingWhat',
          defaultMessage: 'An issued invoice is missing its {what}',
        },
        { what },
      ),
    );
  }
  return value;
}
