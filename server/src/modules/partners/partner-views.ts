import type { Address, Contact, Partner } from './dto/partner-response.dto';

/*
 * A partner and its children as the API returns them (ADR-068): their own
 * fields, never the row, which would also send the organization, the
 * pinyin kept for search, and the location and owner columns an address
 * or contact shares with the organization's own.
 */

export function partnerOf(row: Partner): Partner {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    taxId: row.taxId,
    salePriceListId: row.salePriceListId,
    purchasePriceListId: row.purchasePriceListId,
    documentLanguage: row.documentLanguage,
    documentSecondLanguage: row.documentSecondLanguage,
    notes: row.notes,
    isActive: row.isActive,
  };
}

export function addressOf(row: Address): Address {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    isBilling: row.isBilling,
    isShipping: row.isShipping,
    isDefault: row.isDefault,
    isActive: row.isActive,
  };
}

export function contactOf(row: Contact): Contact {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
  };
}
