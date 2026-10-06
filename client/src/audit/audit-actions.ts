import { defineMessages } from 'react-intl';

/**
 * Every action the audit log records, by name in the reader's language
 * (ADR-054). The keys are the server's (server/src/core/audit/audit-actions.ts);
 * server/scripts/check-client-audit-actions.js fails CI when this list and
 * the server's disagree, so a new action cannot arrive unnamed. An action
 * missing here anyway is still spelled out from its key, in English.
 */
export const AUDIT_ACTION_NAMES = defineMessages({
  'bom.archived': {
    id: 'audit.action.bomArchived',
    defaultMessage: 'Recipe archived',
  },
  'bom.created': {
    id: 'audit.action.bomCreated',
    defaultMessage: 'Recipe created',
  },
  'bom.line_added': {
    id: 'audit.action.bomLineAdded',
    defaultMessage: 'Recipe component added',
  },
  'bom.line_removed': {
    id: 'audit.action.bomLineRemoved',
    defaultMessage: 'Recipe component removed',
  },
  'bom.line_updated': {
    id: 'audit.action.bomLineUpdated',
    defaultMessage: 'Recipe component updated',
  },
  'bom.promoted': {
    id: 'audit.action.bomPromoted',
    defaultMessage: 'Recipe promoted',
  },
  'bom.updated': {
    id: 'audit.action.bomUpdated',
    defaultMessage: 'Recipe updated',
  },
  'credit_note.issued': {
    id: 'audit.action.creditNoteIssued',
    defaultMessage: 'Credit note issued',
  },
  'exchange_rate.set': {
    id: 'audit.action.exchangeRateSet',
    defaultMessage: 'Exchange rate set',
  },
  'invoice.created': {
    id: 'audit.action.invoiceCreated',
    defaultMessage: 'Invoice drafted',
  },
  'invoice.deleted': {
    id: 'audit.action.invoiceDeleted',
    defaultMessage: 'Draft invoice deleted',
  },
  'invoice.issued': {
    id: 'audit.action.invoiceIssued',
    defaultMessage: 'Invoice issued',
  },
  'invoice.line_updated': {
    id: 'audit.action.invoiceLineUpdated',
    defaultMessage: 'Invoice line updated',
  },
  'invoice.updated': {
    id: 'audit.action.invoiceUpdated',
    defaultMessage: 'Invoice updated',
  },
  'invoice.voided': {
    id: 'audit.action.invoiceVoided',
    defaultMessage: 'Invoice voided',
  },
  'location.created': {
    id: 'audit.action.locationCreated',
    defaultMessage: 'Location created',
  },
  'location.updated': {
    id: 'audit.action.locationUpdated',
    defaultMessage: 'Location updated',
  },
  'member.removed': {
    id: 'audit.action.memberRemoved',
    defaultMessage: 'Member removed',
  },
  'order.created': {
    id: 'audit.action.orderCreated',
    defaultMessage: 'Order created',
  },
  'order.line_added': {
    id: 'audit.action.orderLineAdded',
    defaultMessage: 'Order line added',
  },
  'order.line_closed_short': {
    id: 'audit.action.orderLineClosedShort',
    defaultMessage: 'Order line closed short',
  },
  'order.line_list_priced': {
    id: 'audit.action.orderLineListPriced',
    defaultMessage: 'Order line priced from a list',
  },
  'order.line_received': {
    id: 'audit.action.orderLineReceived',
    defaultMessage: 'Order line received',
  },
  'order.line_removed': {
    id: 'audit.action.orderLineRemoved',
    defaultMessage: 'Order line removed',
  },
  'order.line_reopened': {
    id: 'audit.action.orderLineReopened',
    defaultMessage: 'Order line reopened',
  },
  'order.line_updated': {
    id: 'audit.action.orderLineUpdated',
    defaultMessage: 'Order line updated',
  },
  'order.return_received': {
    id: 'audit.action.orderReturnReceived',
    defaultMessage: 'Return received',
  },
  'order.shipment_voided': {
    id: 'audit.action.orderShipmentVoided',
    defaultMessage: 'Shipment voided',
  },
  'order.shipped': {
    id: 'audit.action.orderShipped',
    defaultMessage: 'Order shipped',
  },
  'order.updated': {
    id: 'audit.action.orderUpdated',
    defaultMessage: 'Order updated',
  },
  'organization.address_updated': {
    id: 'audit.action.organizationAddressUpdated',
    defaultMessage: 'Registered address updated',
  },
  'organization.updated': {
    id: 'audit.action.organizationUpdated',
    defaultMessage: 'Organization updated',
  },
  'partner.address.created': {
    id: 'audit.action.partnerAddressCreated',
    defaultMessage: 'Partner address added',
  },
  'partner.address.retired': {
    id: 'audit.action.partnerAddressRetired',
    defaultMessage: 'Partner address retired',
  },
  'partner.address.updated': {
    id: 'audit.action.partnerAddressUpdated',
    defaultMessage: 'Partner address updated',
  },
  'partner.contact.created': {
    id: 'audit.action.partnerContactCreated',
    defaultMessage: 'Partner contact added',
  },
  'partner.contact.retired': {
    id: 'audit.action.partnerContactRetired',
    defaultMessage: 'Partner contact retired',
  },
  'partner.contact.updated': {
    id: 'audit.action.partnerContactUpdated',
    defaultMessage: 'Partner contact updated',
  },
  'partner.created': {
    id: 'audit.action.partnerCreated',
    defaultMessage: 'Partner created',
  },
  'partner.updated': {
    id: 'audit.action.partnerUpdated',
    defaultMessage: 'Partner updated',
  },
  'price_list.created': {
    id: 'audit.action.priceListCreated',
    defaultMessage: 'Price list created',
  },
  'price_list.item_removed': {
    id: 'audit.action.priceListItemRemoved',
    defaultMessage: 'Price removed from a list',
  },
  'price_list.item_set': {
    id: 'audit.action.priceListItemSet',
    defaultMessage: 'Price set on a list',
  },
  'price_list.updated': {
    id: 'audit.action.priceListUpdated',
    defaultMessage: 'Price list updated',
  },
  'product.created': {
    id: 'audit.action.productCreated',
    defaultMessage: 'Product created',
  },
  'product.updated': {
    id: 'audit.action.productUpdated',
    defaultMessage: 'Product updated',
  },
  'product.variant_added': {
    id: 'audit.action.productVariantAdded',
    defaultMessage: 'Product variant added',
  },
  'product.variant_updated': {
    id: 'audit.action.productVariantUpdated',
    defaultMessage: 'Product variant updated',
  },
  'product_licence.created': {
    id: 'audit.action.productLicenceCreated',
    defaultMessage: 'Licence added',
  },
  'product_licence.updated': {
    id: 'audit.action.productLicenceUpdated',
    defaultMessage: 'Licence updated',
  },
  'production_order.cancelled': {
    id: 'audit.action.productionOrderCancelled',
    defaultMessage: 'Production run cancelled',
  },
  'production_order.closed': {
    id: 'audit.action.productionOrderClosed',
    defaultMessage: 'Production run closed',
  },
  'production_order.created': {
    id: 'audit.action.productionOrderCreated',
    defaultMessage: 'Production run planned',
  },
  'production_order.output_recorded': {
    id: 'audit.action.productionOrderOutputRecorded',
    defaultMessage: 'Production output recorded',
  },
  'production_order.released': {
    id: 'audit.action.productionOrderReleased',
    defaultMessage: 'Production run released',
  },
  'production_order.updated': {
    id: 'audit.action.productionOrderUpdated',
    defaultMessage: 'Production run updated',
  },
  'return_authorization.cancelled': {
    id: 'audit.action.returnAuthorizationCancelled',
    defaultMessage: 'Return authorization cancelled',
  },
  'return_authorization.closed': {
    id: 'audit.action.returnAuthorizationClosed',
    defaultMessage: 'Return authorization closed',
  },
  'return_authorization.created': {
    id: 'audit.action.returnAuthorizationCreated',
    defaultMessage: 'Return authorized',
  },
  'return_authorization.replacement_raised': {
    id: 'audit.action.returnAuthorizationReplacementRaised',
    defaultMessage: 'Replacement order raised',
  },
  'return_authorization.return_linked': {
    id: 'audit.action.returnAuthorizationReturnLinked',
    defaultMessage: 'Return linked to an authorization',
  },
  'stock.lot_updated': {
    id: 'audit.action.stockLotUpdated',
    defaultMessage: 'Lot updated',
  },
  'stock.movement_recorded': {
    id: 'audit.action.stockMovementRecorded',
    defaultMessage: 'Stock movement recorded',
  },
  'stock_valuation.cost_set': {
    id: 'audit.action.stockValuationCostSet',
    defaultMessage: 'Cost set',
  },
  'tax_code.created': {
    id: 'audit.action.taxCodeCreated',
    defaultMessage: 'Tax code created',
  },
  'tax_code.updated': {
    id: 'audit.action.taxCodeUpdated',
    defaultMessage: 'Tax code updated',
  },
  'user.created': {
    id: 'audit.action.userCreated',
    defaultMessage: 'Added a member',
  },
  'user.role_changed': {
    id: 'audit.action.userRoleChanged',
    defaultMessage: "Changed a member's role",
  },
});
