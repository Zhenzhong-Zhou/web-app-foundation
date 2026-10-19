import { t, type Translatable } from '../../i18n/translate';
import type { AuditAction } from './audit-actions';

/**
 * Each action's name, in words a person reads (ADR-076): moved from the
 * client, so the screens and the CSV say the same thing. A Record over
 * every action, so one added to AUDIT_ACTIONS without a name fails to
 * compile.
 */
export const ACTION_NAMES: Record<AuditAction, Translatable> = {
  'bom.archived': t({
    id: 'audit.action.bomArchived',
    defaultMessage: 'Recipe archived',
  }),
  'bom.created': t({
    id: 'audit.action.bomCreated',
    defaultMessage: 'Recipe created',
  }),
  'bom.line_added': t({
    id: 'audit.action.bomLineAdded',
    defaultMessage: 'Recipe component added',
  }),
  'bom.line_removed': t({
    id: 'audit.action.bomLineRemoved',
    defaultMessage: 'Recipe component removed',
  }),
  'bom.line_updated': t({
    id: 'audit.action.bomLineUpdated',
    defaultMessage: 'Recipe component updated',
  }),
  'bom.promoted': t({
    id: 'audit.action.bomPromoted',
    defaultMessage: 'Recipe promoted',
  }),
  'bom.updated': t({
    id: 'audit.action.bomUpdated',
    defaultMessage: 'Recipe updated',
  }),
  'credit_note.issued': t({
    id: 'audit.action.creditNoteIssued',
    defaultMessage: 'Credit note issued',
  }),
  'exchange_rate.set': t({
    id: 'audit.action.exchangeRateSet',
    defaultMessage: 'Exchange rate set',
  }),
  'invitation.accepted': t({
    id: 'audit.action.invitationAccepted',
    defaultMessage: 'Invitation accepted',
  }),
  'invitation.link_copied': t({
    id: 'audit.action.invitationLinkCopied',
    defaultMessage: 'Invitation link copied',
  }),
  'invitation.resent': t({
    id: 'audit.action.invitationResent',
    defaultMessage: 'Invitation resent',
  }),
  'invitation.revoked': t({
    id: 'audit.action.invitationRevoked',
    defaultMessage: 'Invitation revoked',
  }),
  'invitation.sent': t({
    id: 'audit.action.invitationSent',
    defaultMessage: 'Invitation sent',
  }),
  'invoice.created': t({
    id: 'audit.action.invoiceCreated',
    defaultMessage: 'Invoice drafted',
  }),
  'invoice.deleted': t({
    id: 'audit.action.invoiceDeleted',
    defaultMessage: 'Draft invoice deleted',
  }),
  'invoice.issued': t({
    id: 'audit.action.invoiceIssued',
    defaultMessage: 'Invoice issued',
  }),
  'invoice.line_updated': t({
    id: 'audit.action.invoiceLineUpdated',
    defaultMessage: 'Invoice line updated',
  }),
  'invoice.updated': t({
    id: 'audit.action.invoiceUpdated',
    defaultMessage: 'Invoice updated',
  }),
  'invoice.voided': t({
    id: 'audit.action.invoiceVoided',
    defaultMessage: 'Invoice voided',
  }),
  'list.exported': t({
    id: 'audit.action.listExported',
    defaultMessage: 'Exported a list',
  }),
  'location.created': t({
    id: 'audit.action.locationCreated',
    defaultMessage: 'Location created',
  }),
  'location.updated': t({
    id: 'audit.action.locationUpdated',
    defaultMessage: 'Location updated',
  }),
  'member.left': t({
    id: 'audit.action.memberLeft',
    defaultMessage: 'Left the organization',
  }),
  'member.removed': t({
    id: 'audit.action.memberRemoved',
    defaultMessage: 'Member removed',
  }),
  'order.created': t({
    id: 'audit.action.orderCreated',
    defaultMessage: 'Order created',
  }),
  'order.line_added': t({
    id: 'audit.action.orderLineAdded',
    defaultMessage: 'Order line added',
  }),
  'order.line_closed_short': t({
    id: 'audit.action.orderLineClosedShort',
    defaultMessage: 'Order line closed short',
  }),
  'order.line_list_priced': t({
    id: 'audit.action.orderLineListPriced',
    defaultMessage: 'Order line priced from a list',
  }),
  'order.line_received': t({
    id: 'audit.action.orderLineReceived',
    defaultMessage: 'Order line received',
  }),
  'order.line_removed': t({
    id: 'audit.action.orderLineRemoved',
    defaultMessage: 'Order line removed',
  }),
  'order.line_reopened': t({
    id: 'audit.action.orderLineReopened',
    defaultMessage: 'Order line reopened',
  }),
  'order.line_updated': t({
    id: 'audit.action.orderLineUpdated',
    defaultMessage: 'Order line updated',
  }),
  'order.return_received': t({
    id: 'audit.action.orderReturnReceived',
    defaultMessage: 'Return received',
  }),
  'order.shipment_voided': t({
    id: 'audit.action.orderShipmentVoided',
    defaultMessage: 'Shipment voided',
  }),
  'order.shipped': t({
    id: 'audit.action.orderShipped',
    defaultMessage: 'Order shipped',
  }),
  'order.pro_forma_made': t({
    id: 'audit.action.orderProFormaMade',
    defaultMessage: 'Pro forma invoice made',
  }),
  'order.updated': t({
    id: 'audit.action.orderUpdated',
    defaultMessage: 'Order updated',
  }),
  'organization.address_updated': t({
    id: 'audit.action.organizationAddressUpdated',
    defaultMessage: 'Registered address updated',
  }),
  'organization.deletion_cancelled': t({
    id: 'audit.action.organizationDeletionCancelled',
    defaultMessage: 'Organization deletion cancelled',
  }),
  'organization.deletion_scheduled': t({
    id: 'audit.action.organizationDeletionScheduled',
    defaultMessage: 'Organization deletion scheduled',
  }),
  'organization.exported': t({
    id: 'audit.action.organizationExported',
    defaultMessage: 'Everything downloaded',
  }),
  'organization.numbering_updated': t({
    id: 'audit.action.organizationNumberingUpdated',
    defaultMessage: 'Numbering changed',
  }),
  'organization.updated': t({
    id: 'audit.action.organizationUpdated',
    defaultMessage: 'Organization updated',
  }),
  'partner.address.created': t({
    id: 'audit.action.partnerAddressCreated',
    defaultMessage: 'Partner address added',
  }),
  'partner.address.retired': t({
    id: 'audit.action.partnerAddressRetired',
    defaultMessage: 'Partner address retired',
  }),
  'partner.address.updated': t({
    id: 'audit.action.partnerAddressUpdated',
    defaultMessage: 'Partner address updated',
  }),
  'partner.contact.created': t({
    id: 'audit.action.partnerContactCreated',
    defaultMessage: 'Partner contact added',
  }),
  'partner.contact.retired': t({
    id: 'audit.action.partnerContactRetired',
    defaultMessage: 'Partner contact retired',
  }),
  'partner.contact.updated': t({
    id: 'audit.action.partnerContactUpdated',
    defaultMessage: 'Partner contact updated',
  }),
  'partner.created': t({
    id: 'audit.action.partnerCreated',
    defaultMessage: 'Partner created',
  }),
  'partner.updated': t({
    id: 'audit.action.partnerUpdated',
    defaultMessage: 'Partner updated',
  }),
  'price_list.created': t({
    id: 'audit.action.priceListCreated',
    defaultMessage: 'Price list created',
  }),
  'price_list.item_removed': t({
    id: 'audit.action.priceListItemRemoved',
    defaultMessage: 'Price removed from a list',
  }),
  'price_list.item_set': t({
    id: 'audit.action.priceListItemSet',
    defaultMessage: 'Price set on a list',
  }),
  'price_list.updated': t({
    id: 'audit.action.priceListUpdated',
    defaultMessage: 'Price list updated',
  }),
  'product.created': t({
    id: 'audit.action.productCreated',
    defaultMessage: 'Product created',
  }),
  'product.updated': t({
    id: 'audit.action.productUpdated',
    defaultMessage: 'Product updated',
  }),
  'product.variant_added': t({
    id: 'audit.action.productVariantAdded',
    defaultMessage: 'Product variant added',
  }),
  'product.variant_updated': t({
    id: 'audit.action.productVariantUpdated',
    defaultMessage: 'Product variant updated',
  }),
  'product_licence.created': t({
    id: 'audit.action.productLicenceCreated',
    defaultMessage: 'Licence added',
  }),
  'product_licence.updated': t({
    id: 'audit.action.productLicenceUpdated',
    defaultMessage: 'Licence updated',
  }),
  'production_order.cancelled': t({
    id: 'audit.action.productionOrderCancelled',
    defaultMessage: 'Production run cancelled',
  }),
  'production_order.closed': t({
    id: 'audit.action.productionOrderClosed',
    defaultMessage: 'Production run closed',
  }),
  'production_order.created': t({
    id: 'audit.action.productionOrderCreated',
    defaultMessage: 'Production run planned',
  }),
  'production_order.output_recorded': t({
    id: 'audit.action.productionOrderOutputRecorded',
    defaultMessage: 'Production output recorded',
  }),
  'production_order.released': t({
    id: 'audit.action.productionOrderReleased',
    defaultMessage: 'Production run released',
  }),
  'production_order.updated': t({
    id: 'audit.action.productionOrderUpdated',
    defaultMessage: 'Production run updated',
  }),
  'return_authorization.cancelled': t({
    id: 'audit.action.returnAuthorizationCancelled',
    defaultMessage: 'Return authorization cancelled',
  }),
  'return_authorization.closed': t({
    id: 'audit.action.returnAuthorizationClosed',
    defaultMessage: 'Return authorization closed',
  }),
  'return_authorization.created': t({
    id: 'audit.action.returnAuthorizationCreated',
    defaultMessage: 'Return authorized',
  }),
  'return_authorization.replacement_raised': t({
    id: 'audit.action.returnAuthorizationReplacementRaised',
    defaultMessage: 'Replacement order raised',
  }),
  'return_authorization.return_linked': t({
    id: 'audit.action.returnAuthorizationReturnLinked',
    defaultMessage: 'Return linked to an authorization',
  }),
  'return_authorization.updated': t({
    id: 'audit.action.returnAuthorizationUpdated',
    defaultMessage: 'Return authorization updated',
  }),
  'stock.lot_updated': t({
    id: 'audit.action.stockLotUpdated',
    defaultMessage: 'Lot updated',
  }),
  'stock.movement_recorded': t({
    id: 'audit.action.stockMovementRecorded',
    defaultMessage: 'Stock movement recorded',
  }),
  'stock_valuation.cost_set': t({
    id: 'audit.action.stockValuationCostSet',
    defaultMessage: 'Cost set',
  }),
  'tax_code.created': t({
    id: 'audit.action.taxCodeCreated',
    defaultMessage: 'Tax code created',
  }),
  'tax_code.updated': t({
    id: 'audit.action.taxCodeUpdated',
    defaultMessage: 'Tax code updated',
  }),
  'user.account_deleted': t({
    id: 'audit.action.userAccountDeleted',
    defaultMessage: 'Account deleted',
  }),
  'user.created': t({
    id: 'audit.action.userCreated',
    defaultMessage: 'Added a member',
  }),
  'user.role_changed': t({
    id: 'audit.action.userRoleChanged',
    defaultMessage: "Changed a member's role",
  }),
};

/**
 * Each kind of record a row is about, and each list an export names, in
 * words. A type with no entry reads as a record, never as its key.
 */
export const RESOURCE_TYPE_NAMES: Record<string, Translatable> = {
  product: t({ id: 'audit.type.product', defaultMessage: 'Product' }),
  partner: t({ id: 'audit.type.partner', defaultMessage: 'Partner' }),
  location: t({ id: 'audit.type.location', defaultMessage: 'Location' }),
  order: t({ id: 'audit.type.order', defaultMessage: 'Order' }),
  production_order: t({
    id: 'audit.type.productionOrder',
    defaultMessage: 'Production run',
  }),
  bom: t({ id: 'audit.type.bom', defaultMessage: 'Recipe' }),
  product_licence: t({
    id: 'audit.type.productLicence',
    defaultMessage: 'Licence',
  }),
  tax_code: t({ id: 'audit.type.taxCode', defaultMessage: 'Tax code' }),
  invoice: t({ id: 'audit.type.invoice', defaultMessage: 'Invoice' }),
  credit_note: t({
    id: 'audit.type.creditNote',
    defaultMessage: 'Credit note',
  }),
  return_authorization: t({
    id: 'audit.type.returnAuthorization',
    defaultMessage: 'Return',
  }),
  organization: t({
    id: 'audit.type.organization',
    defaultMessage: 'Organization',
  }),
  lot: t({ id: 'audit.type.lot', defaultMessage: 'Lot' }),
  stock_movement: t({
    id: 'audit.type.stockMovement',
    defaultMessage: 'Stock movement',
  }),
  stock_valuation: t({
    id: 'audit.type.stockValuation',
    defaultMessage: 'Stock value',
  }),
  exchange_rate: t({
    id: 'audit.type.exchangeRate',
    defaultMessage: 'Exchange rate',
  }),
  price_list: t({ id: 'audit.type.priceList', defaultMessage: 'Price list' }),
  user: t({ id: 'audit.type.user', defaultMessage: 'Member' }),
  invitation: t({ id: 'audit.type.invitation', defaultMessage: 'Invitation' }),
  audit: t({ id: 'audit.type.audit', defaultMessage: 'Audit log' }),
  invoices: t({ id: 'audit.type.invoices', defaultMessage: 'Invoices' }),
  'credit-notes': t({
    id: 'audit.type.creditNotes',
    defaultMessage: 'Credit notes',
  }),
  orders: t({ id: 'audit.type.orders', defaultMessage: 'Orders' }),
  products: t({ id: 'audit.type.products', defaultMessage: 'Products' }),
  partners: t({ id: 'audit.type.partners', defaultMessage: 'Partners' }),
  movements: t({ id: 'audit.type.movements', defaultMessage: 'Movements' }),
  inventory: t({ id: 'audit.type.inventory', defaultMessage: 'Inventory' }),
  stock_value: t({
    id: 'audit.type.stockValue',
    defaultMessage: 'Stock value',
  }),
};
