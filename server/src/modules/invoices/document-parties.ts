import type { DocumentParties } from './dto/invoice-response.dto';

/**
 * A document's seller and bill-to, as copied at issue: the stored columns
 * the API returns (ADR-068), and not the address row the bill-to came from.
 */
export function partiesOf(row: DocumentParties): DocumentParties {
  return {
    sellerName: row.sellerName,
    sellerTaxNumber: row.sellerTaxNumber,
    sellerLine1: row.sellerLine1,
    sellerLine2: row.sellerLine2,
    sellerCity: row.sellerCity,
    sellerRegion: row.sellerRegion,
    sellerPostalCode: row.sellerPostalCode,
    sellerCountry: row.sellerCountry,
    billToName: row.billToName,
    billToLine1: row.billToLine1,
    billToLine2: row.billToLine2,
    billToCity: row.billToCity,
    billToRegion: row.billToRegion,
    billToPostalCode: row.billToPostalCode,
    billToCountry: row.billToCountry,
  };
}
