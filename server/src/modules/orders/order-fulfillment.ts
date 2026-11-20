/**
 * How much of a confirmed order has come or gone (#605; ADR-093's R25,
 * 56a and 92a), worked out from its lines by `fulfillmentOf()` in
 * orders.service.ts: `none` while nothing has, `part` while something has
 * and something is still due, `all` once nothing is still due, a line
 * closed short counting as done.
 *
 * Here apart from the service, so the list's query can take it without
 * importing the service.
 */
export const ORDER_FULFILLMENTS = ['none', 'part', 'all'] as const;

export type OrderFulfillment = (typeof ORDER_FULFILLMENTS)[number];
