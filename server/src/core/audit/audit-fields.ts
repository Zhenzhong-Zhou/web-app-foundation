import type {
  IdleSignOutScope,
  LicencePolicy,
  MovementReason,
  NumberingReset,
  OrderDirection,
  OrderStatus,
  OrganizationRail,
  PaperSize,
  ReturnResolution,
} from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import type { SystemRole } from '../authorization/permissions';
import type { ReferenceKind } from './audit-references';

/**
 * How a value reads (ADR-076). `text` is shown as recorded: typed words,
 * numbers and codes. `dayAfter` is a range's end, the start of the day
 * after its last (ADR-057), read as that last day. A `set` reads each
 * stored code as its word.
 */
export type Reader =
  | 'text'
  | 'day'
  | 'dayAfter'
  | 'boolean'
  | 'language'
  | 'country'
  | 'timeZone'
  | 'action'
  | 'reference'
  | { set: Record<string, Translatable> }
  | { file: Translatable | null };

/** What a payload key is called, and how its value reads. */
export interface FieldSpec {
  name: Translatable;
  read: Reader;
}

/** status */
const STATUS_WORDS: Record<OrderStatus, Translatable> = {
  draft: t({ id: 'audit.value.status.draft', defaultMessage: 'Draft' }),
  confirmed: t({
    id: 'audit.value.status.confirmed',
    defaultMessage: 'Confirmed',
  }),
  fulfilled: t({
    id: 'audit.value.status.fulfilled',
    defaultMessage: 'Completed',
  }),
  cancelled: t({
    id: 'audit.value.status.cancelled',
    defaultMessage: 'Cancelled',
  }),
};

/** direction */
const DIRECTION_WORDS: Record<OrderDirection, Translatable> = {
  purchase: t({
    id: 'audit.value.direction.purchase',
    defaultMessage: 'Purchase',
  }),
  sale: t({ id: 'audit.value.direction.sale', defaultMessage: 'Sale' }),
};

/** resolution */
const RESOLUTION_WORDS: Record<ReturnResolution, Translatable> = {
  credit: t({ id: 'audit.value.resolution.credit', defaultMessage: 'Credit' }),
  replace: t({
    id: 'audit.value.resolution.replace',
    defaultMessage: 'Replace',
  }),
  none: t({ id: 'audit.value.resolution.none', defaultMessage: 'None' }),
};

/** policy */
const POLICY_WORDS: Record<LicencePolicy, Translatable> = {
  block: t({ id: 'audit.value.policy.block', defaultMessage: 'Refuse' }),
  override: t({
    id: 'audit.value.policy.override',
    defaultMessage: 'Allow with a reason',
  }),
  allow: t({ id: 'audit.value.policy.allow', defaultMessage: 'Allow' }),
};

/** scope */
const SCOPE_WORDS: Record<IdleSignOutScope, Translatable> = {
  unticked: t({
    id: 'audit.value.scope.unticked',
    defaultMessage: 'Those who did not tick Keep me signed in',
  }),
  everyone: t({ id: 'audit.value.scope.everyone', defaultMessage: 'Everyone' }),
};

/** rail */
const RAIL_WORDS: Record<OrganizationRail, Translatable> = {
  dark: t({ id: 'audit.value.rail.dark', defaultMessage: 'Dark' }),
  light: t({ id: 'audit.value.rail.light', defaultMessage: 'Light' }),
};

/** paper */
const PAPER_WORDS: Record<PaperSize, Translatable> = {
  letter: t({ id: 'audit.value.paper.letter', defaultMessage: 'Letter' }),
  a4: t({ id: 'audit.value.paper.a4', defaultMessage: 'A4' }),
};

/** reason */
const REASON_WORDS: Record<MovementReason, Translatable> = {
  receipt: t({ id: 'audit.value.reason.receipt', defaultMessage: 'Receipt' }),
  shipment: t({
    id: 'audit.value.reason.shipment',
    defaultMessage: 'Shipment',
  }),
  transfer: t({
    id: 'audit.value.reason.transfer',
    defaultMessage: 'Transfer',
  }),
  adjustment: t({
    id: 'audit.value.reason.adjustment',
    defaultMessage: 'Adjustment',
  }),
  production: t({
    id: 'audit.value.reason.production',
    defaultMessage: 'Production',
  }),
  consumption: t({
    id: 'audit.value.reason.consumption',
    defaultMessage: 'Consumption',
  }),
  sample: t({ id: 'audit.value.reason.sample', defaultMessage: 'Sample' }),
  return: t({ id: 'audit.value.reason.return', defaultMessage: 'Return' }),
};

/** list */
const LIST_WORDS: Record<string, Translatable> = {
  price_list: t({
    id: 'audit.value.list.priceList',
    defaultMessage: 'A price list',
  }),
  invoices: t({ id: 'audit.value.list.invoices', defaultMessage: 'Invoices' }),
  'credit-notes': t({
    id: 'audit.value.list.creditNotes',
    defaultMessage: 'Credit notes',
  }),
  orders: t({ id: 'audit.value.list.orders', defaultMessage: 'Orders' }),
  stock_value: t({
    id: 'audit.value.list.stockValue',
    defaultMessage: 'Stock value',
  }),
  partners: t({ id: 'audit.value.list.partners', defaultMessage: 'Partners' }),
  products: t({ id: 'audit.value.list.products', defaultMessage: 'Products' }),
  inventory: t({
    id: 'audit.value.list.inventory',
    defaultMessage: 'Inventory',
  }),
  movements: t({
    id: 'audit.value.list.movements',
    defaultMessage: 'Movements',
  }),
  audit: t({ id: 'audit.value.list.audit', defaultMessage: 'The audit log' }),
  'your-activity': t({
    id: 'audit.value.list.yourActivity',
    defaultMessage: 'Your activity',
  }),
};

/** export */
const EXPORT_WORDS: Record<'downloaded' | 'declined', Translatable> = {
  downloaded: t({
    id: 'audit.value.export.downloaded',
    defaultMessage: 'Downloaded',
  }),
  declined: t({
    id: 'audit.value.export.declined',
    defaultMessage: 'Not needed',
  }),
};

/**
 * emailSent: recorded only when an invitation's email did not go
 * (ADR-077), so it reads "Email not sent".
 */
const EMAIL_SENT_WORDS: Record<'false', Translatable> = {
  false: t({ id: 'audit.value.emailSent.false', defaultMessage: 'not sent' }),
};

/** gettingStarted */
const GETTINGSTARTED_WORDS: Record<string, Translatable> = {
  dismissed: t({
    id: 'audit.value.gettingStarted.dismissed',
    defaultMessage: 'Dismissed',
  }),
  shown: t({ id: 'audit.value.gettingStarted.shown', defaultMessage: 'Shown' }),
  'team step skipped': t({
    id: 'audit.value.gettingStarted.teamStepSkipped',
    defaultMessage: 'Team step skipped',
  }),
};

/** reset */
const RESET_WORDS: Record<NumberingReset, Translatable> = {
  never: t({ id: 'audit.value.reset.never', defaultMessage: 'Never' }),
  yearly: t({ id: 'audit.value.reset.yearly', defaultMessage: 'Each year' }),
  monthly: t({ id: 'audit.value.reset.monthly', defaultMessage: 'Each month' }),
  daily: t({ id: 'audit.value.reset.daily', defaultMessage: 'Each day' }),
};

/** A system role's name, which the roles table stores in English. */
export const ROLE_NAMES: Record<SystemRole, Translatable> = {
  Owner: t({ id: 'audit.value.role.owner', defaultMessage: 'Owner' }),
  Admin: t({ id: 'audit.value.role.admin', defaultMessage: 'Admin' }),
  Viewer: t({ id: 'audit.value.role.viewer', defaultMessage: 'Viewer' }),
};

/** What a reference reads as when it names nothing: an old row, or none. */
export const KIND_WORDS: Record<ReferenceKind, Translatable> = {
  order: t({ id: 'audit.kind.order', defaultMessage: 'an order' }),
  invoice: t({ id: 'audit.kind.invoice', defaultMessage: 'an invoice' }),
  tax_code: t({ id: 'audit.kind.taxCode', defaultMessage: 'a tax code' }),
  shipment: t({ id: 'audit.kind.shipment', defaultMessage: 'a shipment' }),
  order_return: t({ id: 'audit.kind.orderReturn', defaultMessage: 'a return' }),
  role: t({ id: 'audit.kind.role', defaultMessage: 'a role' }),
  location: t({ id: 'audit.kind.location', defaultMessage: 'a location' }),
  price_list: t({ id: 'audit.kind.priceList', defaultMessage: 'a price list' }),
  order_line: t({ id: 'audit.kind.orderLine', defaultMessage: 'an item' }),
  partner: t({ id: 'audit.kind.partner', defaultMessage: 'a partner' }),
  variant: t({ id: 'audit.kind.variant', defaultMessage: 'an item' }),
  product: t({ id: 'audit.kind.product', defaultMessage: 'a product' }),
  lot: t({ id: 'audit.kind.lot', defaultMessage: 'a lot' }),
  person: t({ id: 'audit.kind.person', defaultMessage: 'one person' }),
  record: t({ id: 'audit.kind.record', defaultMessage: 'a record' }),
};

/** The few words the formatter says itself. */
export const WORDS = {
  yes: t({ id: 'audit.word.yes', defaultMessage: 'Yes' }),
  no: t({ id: 'audit.word.no', defaultMessage: 'No' }),
  noChanges: t({
    id: 'audit.word.noChanges',
    defaultMessage: 'Saved with no changes',
  }),
  logoReplaced: t({
    id: 'audit.word.logoReplaced',
    defaultMessage: 'replaced',
  }),
  logoRemoved: t({ id: 'audit.word.logoRemoved', defaultMessage: 'removed' }),
  imageAdded: t({
    id: 'audit.word.imageAdded',
    defaultMessage: 'an image added',
  }),
  imagesReordered: t({
    id: 'audit.word.imagesReordered',
    defaultMessage: 'the images reordered',
  }),
  detail: t({ id: 'audit.word.detail', defaultMessage: 'Detail' }),
  you: t({ id: 'audit.word.you', defaultMessage: 'you' }),
  typeRecord: t({ id: 'audit.word.typeRecord', defaultMessage: 'Record' }),
} as const;

/**
 * Every key a payload may hold: its name and how its value reads
 * (ADR-076). A key missing here reads as "Detail" and its value as text,
 * never as the code's own name. `@Audited({ fields })`, recordPrevious,
 * recordContext and AuditService.record take only these keys
 * (AuditField), so recording a new one without saying how it reads fails
 * to compile. The compiler does not see the keys inside an export's
 * filters, which are its list's query, or a row that deletion inserts into
 * the table directly; the audit-words e2e reads those in words.
 */
export const AUDIT_FIELDS = {
  reference: {
    name: t({ id: 'audit.field.reference', defaultMessage: 'Reference' }),
    read: 'text',
  },
  name: {
    name: t({ id: 'audit.field.name', defaultMessage: 'Name' }),
    read: 'text',
  },
  // The address an invitation went to (ADR-077).
  email: {
    name: t({ id: 'audit.field.email', defaultMessage: 'Email address' }),
    read: 'text',
  },
  emailSent: {
    name: t({ id: 'audit.field.emailSent', defaultMessage: 'Email' }),
    read: { set: EMAIL_SENT_WORDS },
  },
  number: {
    name: t({ id: 'audit.field.number', defaultMessage: 'Number' }),
    read: 'text',
  },
  authority: {
    name: t({ id: 'audit.field.authority', defaultMessage: 'Authority' }),
    read: 'text',
  },
  line1: {
    name: t({ id: 'audit.field.line1', defaultMessage: 'Address line 1' }),
    read: 'text',
  },
  line2: {
    name: t({ id: 'audit.field.line2', defaultMessage: 'Address line 2' }),
    read: 'text',
  },
  city: {
    name: t({ id: 'audit.field.city', defaultMessage: 'City' }),
    read: 'text',
  },
  region: {
    name: t({ id: 'audit.field.region', defaultMessage: 'Province or state' }),
    read: 'text',
  },
  postalCode: {
    name: t({ id: 'audit.field.postalCode', defaultMessage: 'Postal code' }),
    read: 'text',
  },
  country: {
    name: t({ id: 'audit.field.country', defaultMessage: 'Country' }),
    read: 'country',
  },
  taxRegistrationNumber: {
    name: t({
      id: 'audit.field.taxRegistrationNumber',
      defaultMessage: 'Tax number',
    }),
    read: 'text',
  },
  sku: {
    name: t({ id: 'audit.field.sku', defaultMessage: 'SKU' }),
    read: 'text',
  },
  currency: {
    name: t({ id: 'audit.field.currency', defaultMessage: 'Currency' }),
    read: 'text',
  },
  baseCurrency: {
    name: t({
      id: 'audit.field.baseCurrency',
      defaultMessage: 'Base currency',
    }),
    read: 'text',
  },
  accentColor: {
    name: t({ id: 'audit.field.accentColor', defaultMessage: 'Accent colour' }),
    read: 'text',
  },
  total: {
    name: t({ id: 'audit.field.total', defaultMessage: 'Total' }),
    read: 'text',
  },
  rate: {
    name: t({ id: 'audit.field.rate', defaultMessage: 'Rate' }),
    read: 'text',
  },
  exchangeRate: {
    name: t({
      id: 'audit.field.exchangeRate',
      defaultMessage: 'Exchange rate',
    }),
    read: 'text',
  },
  unitPrice: {
    name: t({ id: 'audit.field.unitPrice', defaultMessage: 'Unit price' }),
    read: 'text',
  },
  quantity: {
    name: t({ id: 'audit.field.quantity', defaultMessage: 'Quantity' }),
    read: 'text',
  },
  quantityOrdered: {
    name: t({
      id: 'audit.field.quantityOrdered',
      defaultMessage: 'Quantity ordered',
    }),
    read: 'text',
  },
  components: {
    name: t({ id: 'audit.field.components', defaultMessage: 'Tax components' }),
    read: 'text',
  },
  rows: {
    name: t({ id: 'audit.field.rows', defaultMessage: 'Rows' }),
    read: 'text',
  },
  tables: {
    name: t({ id: 'audit.field.tables', defaultMessage: 'Tables' }),
    read: 'text',
  },
  files: {
    name: t({ id: 'audit.field.files', defaultMessage: 'Files' }),
    read: 'text',
  },
  documents: {
    name: t({ id: 'audit.field.documents', defaultMessage: 'Documents' }),
    read: 'text',
  },
  expectedAt: {
    name: t({ id: 'audit.field.expectedAt', defaultMessage: 'Expected' }),
    read: 'day',
  },
  expiresAt: {
    name: t({ id: 'audit.field.expiresAt', defaultMessage: 'Expires' }),
    read: 'day',
  },
  dueDate: {
    name: t({ id: 'audit.field.dueDate', defaultMessage: 'Due date' }),
    read: 'day',
  },
  invoiceDate: {
    name: t({ id: 'audit.field.invoiceDate', defaultMessage: 'Invoice date' }),
    read: 'day',
  },
  creditDate: {
    name: t({ id: 'audit.field.creditDate', defaultMessage: 'Credit date' }),
    read: 'day',
  },
  rateDate: {
    name: t({ id: 'audit.field.rateDate', defaultMessage: 'Rate date' }),
    read: 'day',
  },
  issuedAt: {
    name: t({ id: 'audit.field.issuedAt', defaultMessage: 'Issued' }),
    read: 'day',
  },
  from: {
    name: t({ id: 'audit.field.from', defaultMessage: 'From' }),
    read: 'day',
  },
  to: {
    name: t({ id: 'audit.field.to', defaultMessage: 'To' }),
    read: 'day',
  },
  until: {
    name: t({ id: 'audit.field.until', defaultMessage: 'To' }),
    read: 'dayAfter',
  },
  deletionScheduledAt: {
    name: t({
      id: 'audit.field.deletionScheduledAt',
      defaultMessage: 'Deleted after',
    }),
    read: 'day',
  },
  isActive: {
    name: t({ id: 'audit.field.isActive', defaultMessage: 'In use' }),
    read: 'boolean',
  },
  expectsGoods: {
    name: t({
      id: 'audit.field.expectsGoods',
      defaultMessage: 'Goods to come back',
    }),
    read: 'boolean',
  },
  licenceRequired: {
    name: t({
      id: 'audit.field.licenceRequired',
      defaultMessage: 'Licence required',
    }),
    read: 'boolean',
  },
  logoOnDocuments: {
    name: t({
      id: 'audit.field.logoOnDocuments',
      defaultMessage: 'Logo on documents',
    }),
    read: 'boolean',
  },
  documentsInDateOrder: {
    name: t({
      id: 'audit.field.documentsInDateOrder',
      defaultMessage: 'Documents in date order',
    }),
    read: 'boolean',
  },
  licenceOverridden: {
    name: t({
      id: 'audit.field.licenceOverridden',
      defaultMessage: 'Licence overridden',
    }),
    read: 'boolean',
  },
  reopened: {
    name: t({ id: 'audit.field.reopened', defaultMessage: 'Reopened' }),
    read: 'boolean',
  },
  withAccount: {
    name: t({
      id: 'audit.field.withAccount',
      defaultMessage: 'Account deleted too',
    }),
    read: 'boolean',
  },
  documentLanguage: {
    name: t({
      id: 'audit.field.documentLanguage',
      defaultMessage: 'Document language',
    }),
    read: 'language',
  },
  documentSecondLanguage: {
    name: t({
      id: 'audit.field.documentSecondLanguage',
      defaultMessage: 'Second document language',
    }),
    read: 'language',
  },
  requiredNameLanguages: {
    name: t({
      id: 'audit.field.requiredNameLanguages',
      defaultMessage: 'Names required in',
    }),
    read: 'language',
  },
  timeZone: {
    name: t({ id: 'audit.field.timeZone', defaultMessage: 'Time zone' }),
    read: 'timeZone',
  },
  expiryWarningDays: {
    name: t({
      id: 'audit.field.expiryWarningDays',
      defaultMessage: 'Expiry warning, days',
    }),
    read: 'text',
  },
  expiryCriticalDays: {
    name: t({
      id: 'audit.field.expiryCriticalDays',
      defaultMessage: 'Expiry critical, days',
    }),
    read: 'text',
  },
  idleSignOutMinutes: {
    name: t({
      id: 'audit.field.idleSignOutMinutes',
      defaultMessage: 'Idle sign-out, minutes',
    }),
    read: 'text',
  },
  status: {
    name: t({ id: 'audit.field.status', defaultMessage: 'Status' }),
    read: { set: STATUS_WORDS },
  },
  direction: {
    name: t({ id: 'audit.field.direction', defaultMessage: 'Direction' }),
    read: { set: DIRECTION_WORDS },
  },
  resolution: {
    name: t({ id: 'audit.field.resolution', defaultMessage: 'Resolution' }),
    read: { set: RESOLUTION_WORDS },
  },
  licenceNotInForcePolicy: {
    name: t({
      id: 'audit.field.licenceNotInForcePolicy',
      defaultMessage: 'Licence not yet in force',
    }),
    read: { set: POLICY_WORDS },
  },
  licenceExpiredPolicy: {
    name: t({
      id: 'audit.field.licenceExpiredPolicy',
      defaultMessage: 'Licence expired',
    }),
    read: { set: POLICY_WORDS },
  },
  idleSignOutScope: {
    name: t({
      id: 'audit.field.idleSignOutScope',
      defaultMessage: 'Idle sign-out applies to',
    }),
    read: { set: SCOPE_WORDS },
  },
  rail: {
    name: t({ id: 'audit.field.rail', defaultMessage: 'Side rail' }),
    read: { set: RAIL_WORDS },
  },
  paperSize: {
    name: t({ id: 'audit.field.paperSize', defaultMessage: 'Paper size' }),
    read: { set: PAPER_WORDS },
  },
  reason: {
    name: t({ id: 'audit.field.reason', defaultMessage: 'Reason' }),
    read: { set: REASON_WORDS },
  },
  list: {
    name: t({ id: 'audit.field.list', defaultMessage: 'List' }),
    read: { set: LIST_WORDS },
  },
  export: {
    name: t({ id: 'audit.field.export', defaultMessage: 'Copy of everything' }),
    read: { set: EXPORT_WORDS },
  },
  gettingStarted: {
    name: t({
      id: 'audit.field.gettingStarted',
      defaultMessage: 'Getting started',
    }),
    read: { set: GETTINGSTARTED_WORDS },
  },
  reset: {
    name: t({ id: 'audit.field.reset', defaultMessage: 'Restarts' }),
    read: { set: RESET_WORDS },
  },
  licenceStatus: {
    name: t({
      id: 'audit.field.licenceStatus',
      defaultMessage: 'Licence status',
    }),
    read: 'text',
  },
  licence: {
    name: t({ id: 'audit.field.licence', defaultMessage: 'Licence' }),
    read: 'text',
  },
  prefix: {
    name: t({ id: 'audit.field.prefix', defaultMessage: 'Prefix' }),
    read: 'text',
  },
  digits: {
    name: t({ id: 'audit.field.digits', defaultMessage: 'Digits' }),
    read: 'text',
  },
  width: {
    name: t({ id: 'audit.field.width', defaultMessage: 'Digits' }),
    read: 'text',
  },
  next: {
    name: t({ id: 'audit.field.next', defaultMessage: 'Next number' }),
    read: 'text',
  },
  logoFileId: {
    name: t({ id: 'audit.field.logoFileId', defaultMessage: 'Logo' }),
    read: { file: null },
  },
  fileId: {
    name: t({ id: 'audit.field.fileId', defaultMessage: 'Images' }),
    read: { file: WORDS.imageAdded },
  },
  fileIds: {
    name: t({ id: 'audit.field.fileIds', defaultMessage: 'Images' }),
    read: { file: WORDS.imagesReordered },
  },
  items: {
    name: t({ id: 'audit.field.items', defaultMessage: 'Items' }),
    read: 'text',
  },
  names: {
    name: t({ id: 'audit.field.names', defaultMessage: 'Names' }),
    read: 'text',
  },
  invoice: {
    name: t({ id: 'audit.field.invoice', defaultMessage: 'Invoice' }),
    read: 'text',
  },
  creditNote: {
    name: t({ id: 'audit.field.creditNote', defaultMessage: 'Credit note' }),
    read: 'text',
  },
  returnAuthorization: {
    name: t({
      id: 'audit.field.returnAuthorization',
      defaultMessage: 'Return',
    }),
    read: 'text',
  },
  saleOrder: {
    name: t({ id: 'audit.field.saleOrder', defaultMessage: 'Sale orders' }),
    read: 'text',
  },
  purchaseOrder: {
    name: t({
      id: 'audit.field.purchaseOrder',
      defaultMessage: 'Purchase orders',
    }),
    read: 'text',
  },
  filters: {
    name: t({ id: 'audit.field.filters', defaultMessage: 'Filters' }),
    read: 'text',
  },
  lines: {
    name: t({ id: 'audit.field.lines', defaultMessage: 'Lines' }),
    read: 'text',
  },
  search: {
    name: t({ id: 'audit.field.search', defaultMessage: 'Search' }),
    read: 'text',
  },
  action: {
    name: t({ id: 'audit.field.action', defaultMessage: 'Action' }),
    read: 'action',
  },
  orderId: {
    name: t({ id: 'audit.field.orderId', defaultMessage: 'Order' }),
    read: 'reference',
  },
  order: {
    name: t({ id: 'audit.field.order', defaultMessage: 'Replacement order' }),
    read: 'reference',
  },
  invoiceId: {
    name: t({ id: 'audit.field.invoiceId', defaultMessage: 'Invoice' }),
    read: 'reference',
  },
  taxCodeId: {
    name: t({ id: 'audit.field.taxCodeId', defaultMessage: 'Tax code' }),
    read: 'reference',
  },
  shipmentId: {
    name: t({ id: 'audit.field.shipmentId', defaultMessage: 'Shipment' }),
    read: 'reference',
  },
  returnId: {
    name: t({ id: 'audit.field.returnId', defaultMessage: 'Return received' }),
    read: 'reference',
  },
  roleId: {
    name: t({ id: 'audit.field.roleId', defaultMessage: 'Role' }),
    read: 'reference',
  },
  deliverToId: {
    name: t({ id: 'audit.field.deliverToId', defaultMessage: 'Deliver to' }),
    read: 'reference',
  },
  sendBackToId: {
    name: t({ id: 'audit.field.sendBackToId', defaultMessage: 'Send back to' }),
    read: 'reference',
  },
  defaultSalePriceListId: {
    name: t({
      id: 'audit.field.defaultSalePriceListId',
      defaultMessage: 'Default price list',
    }),
    read: 'reference',
  },
  lineId: {
    name: t({ id: 'audit.field.lineId', defaultMessage: 'Item' }),
    read: 'reference',
  },
  partnerId: {
    name: t({ id: 'audit.field.partnerId', defaultMessage: 'Partner' }),
    read: 'reference',
  },
  locationId: {
    name: t({ id: 'audit.field.locationId', defaultMessage: 'Location' }),
    read: 'reference',
  },
  variantId: {
    name: t({ id: 'audit.field.variantId', defaultMessage: 'Item' }),
    read: 'reference',
  },
  productId: {
    name: t({ id: 'audit.field.productId', defaultMessage: 'Product' }),
    read: 'reference',
  },
  lotId: {
    name: t({ id: 'audit.field.lotId', defaultMessage: 'Lot' }),
    read: 'reference',
  },
  actorId: {
    name: t({ id: 'audit.field.actorId', defaultMessage: 'Person' }),
    read: 'reference',
  },
  resourceId: {
    name: t({ id: 'audit.field.resourceId', defaultMessage: 'Record' }),
    read: 'reference',
  },
} satisfies Record<string, FieldSpec>;

/** A key a payload may hold: one AUDIT_FIELDS declares. */
export type AuditField = keyof typeof AUDIT_FIELDS;

/** A key's declaration, or undefined for one retired from old rows. */
export function fieldOf(key: string): FieldSpec | undefined {
  return (AUDIT_FIELDS as Record<string, FieldSpec>)[key];
}
