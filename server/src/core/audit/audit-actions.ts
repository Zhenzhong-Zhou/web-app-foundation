/**
 * What happened, in the past tense — deliberately not the permission strings.
 *
 * `users.create` is a capability someone holds; `user.created` is an event that
 * occurred. They overlap but are different vocabularies: login and password
 * reset are worth auditing and are gated by no permission, and one permission
 * can gate several distinct actions.
 *
 * Same rule as permissions.ts: never declare an action nothing records. An
 * action with no writer is a filter value in the UI that matches nothing.
 */
export const AUDIT_ACTIONS = {
  USER_CREATED: 'user.created',
  /** A privilege change. "Who granted this" is the question the log answers. */
  USER_ROLE_CHANGED: 'user.role_changed',
  /** Membership removed. The account still exists — see ADR-012 for deletion. */
  MEMBER_REMOVED: 'member.removed',

  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',

  PRODUCT_VARIANT_ADDED: 'product.variant_added',
  PRODUCT_VARIANT_UPDATED: 'product.variant_updated',

  LOCATION_CREATED: 'location.created',
  LOCATION_UPDATED: 'location.updated',

  STOCK_MOVEMENT_RECORDED: 'stock.movement_recorded',

  PARTNER_CREATED: 'partner.created',
  PARTNER_UPDATED: 'partner.updated',

  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_LINE_RECEIVED: 'order.line_received',
  ORDER_LINE_ADDED: 'order.line_added',
  ORDER_LINE_UPDATED: 'order.line_updated',
  ORDER_LINE_REMOVED: 'order.line_removed',
  /** Carries the reason — see ADR-034. */
  ORDER_LINE_CLOSED_SHORT: 'order.line_closed_short',
  ORDER_LINE_REOPENED: 'order.line_reopened',

  PARTNER_ADDRESS_CREATED: 'partner.address.created',
  PARTNER_ADDRESS_UPDATED: 'partner.address.updated',
  PARTNER_ADDRESS_RETIRED: 'partner.address.retired',
  PARTNER_CONTACT_CREATED: 'partner.contact.created',
  PARTNER_CONTACT_UPDATED: 'partner.contact.updated',
  PARTNER_CONTACT_RETIRED: 'partner.contact.retired',

  STOCK_LOT_UPDATED: 'stock.lot_updated',

  BOM_CREATED: 'bom.created',
  BOM_UPDATED: 'bom.updated',
  BOM_LINE_ADDED: 'bom.line_added',
  BOM_LINE_UPDATED: 'bom.line_updated',
  BOM_LINE_REMOVED: 'bom.line_removed',
  /** The moment a recipe becomes the one runs are made against. */
  BOM_PROMOTED: 'bom.promoted',
  BOM_ARCHIVED: 'bom.archived',

  PRODUCTION_ORDER_CREATED: 'production_order.created',
  PRODUCTION_ORDER_UPDATED: 'production_order.updated',
  /** Components issued and the recipe frozen onto the run. */
  PRODUCTION_ORDER_RELEASED: 'production_order.released',
  PRODUCTION_ORDER_OUTPUT_RECORDED: 'production_order.output_recorded',
  /** Carries the variance figures — see ADR-032. */
  PRODUCTION_ORDER_CLOSED: 'production_order.closed',
  PRODUCTION_ORDER_CANCELLED: 'production_order.cancelled',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export const ALL_AUDIT_ACTIONS = Object.values(AUDIT_ACTIONS);
