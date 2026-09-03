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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export const ALL_AUDIT_ACTIONS = Object.values(AUDIT_ACTIONS);
