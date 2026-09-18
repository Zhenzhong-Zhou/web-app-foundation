/**
 * What a notification can be about.
 *
 * A closed vocabulary like AUDIT_ACTIONS, for the same reason: a typo in a
 * string literal is a filter that silently matches nothing.
 */
export const NOTIFICATION_TYPES = {
  /** A run closed with a line well off plan (ADR-032). */
  PRODUCTION_VARIANCE: 'production.variance',
  /** An order line will not be fulfilled in full (ADR-034). */
  ORDER_LINE_CLOSED_SHORT: 'order.line_closed_short',
  /** Somebody signed in. The strongest takeover signal there is. */
  SESSION_CREATED: 'account.session_created',
  PASSWORD_CHANGED: 'account.password_changed',
  /** Distinct from changed: a reset you did not request is an attack (ADR-022). */
  PASSWORD_RESET: 'account.password_reset',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
