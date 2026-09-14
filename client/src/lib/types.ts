/**
 * Shapes the server returns, shared rather than redeclared per feature.
 *
 * Location was declared twice — once in locations-page for the tree, once in
 * inventory-page for the picker — with different fields. Nothing compares the
 * two, so they would drift silently until a component read a property the
 * other's rows did not carry.
 *
 * These describe the API's responses, not the database. A column the client
 * never reads does not belong here.
 */
export interface Location {
  id: string;
  type: string;
  name: string;
  code: string | null;
  parentId: string | null;
  isAvailable: boolean;
  isActive: boolean;
}

export interface StockRow {
  variantId: string;
  sku: string;
  variantName: string | null;
  unitOfMeasure: string;
  locationId: string;
  locationName: string;
  lotId: string | null;
  lotCode: string | null;
  lotExpiresAt: string | null;
  lotIsAssigned: boolean | null;
  /** A decimal string from numeric(18, 4). Never parsed — see ADR-025. */
  quantity: string;
}

export interface Partner {
  id: string;
  name: string;
  code: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface Address {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  isBilling: boolean;
  isShipping: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

/** What GET /partners/:id returns — the partner with its children embedded. */
export interface PartnerDetail extends Partner {
  addresses: Address[];
  contacts: Contact[];
}

export type OrderDirection = 'purchase' | 'sale';
export type OrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled';

export interface OrderSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  direction: OrderDirection;
  status: OrderStatus;
  reference: string | null;
  expectedAt: string | null;
  createdAt: string;
  lineCount: number;
  /** numeric(18,4) as a string — never parsed into a JS number (ADR-025). */
  quantityOrdered: string;
  quantityFulfilled: string;
}

export interface OrderPage {
  entries: OrderSummary[];
  nextCursor: string | null;
}

export interface Lot {
  id: string;
  code: string;
  expiresAt: string | null;
  /** True when the receiver invented the code — see MovementLotDto. */
  isAssigned: boolean;
}

/** The flat variant list behind any picker — stock hangs off variants, not products (ADR-023). */
export interface VariantOption {
  id: string;
  sku: string;
  variantName: string | null;
  productName: string;
  type: string;
  unitOfMeasure: string;
  tracksLots: boolean;
}

export interface OrderLine {
  id: string;
  variantId: string;
  /** Snapshotted when the order was raised (ADR-023). */
  sku: string;
  quantityOrdered: string;
  quantityFulfilled: string;
}

/** What GET /orders/:id returns — the order with its lines. */
export interface OrderDetail {
  id: string;
  partnerId: string;
  partnerName: string;
  direction: OrderDirection;
  fullyReceived: boolean;
  status: OrderStatus;
  reference: string | null;
  expectedAt: string | null;
  note: string | null;
  lines: OrderLine[];
}

export interface Location {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
}
