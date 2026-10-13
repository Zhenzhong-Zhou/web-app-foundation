import type { Permission } from '../api/types.gen';
import { useAuth } from './use-auth';

/**
 * The permissions the client checks: the server's own vocabulary (ADR-004),
 * generated from its OpenAPI document (ADR-068), so a permission added or
 * renamed on the server reaches this type with the next `npm run api`.
 *
 * Only whether to show a control depends on this — the server's guard is
 * the actual check (ADR-016) — so a permission missing here hides a
 * button, never opens a door.
 */
export type { Permission };

/** Whether the signed-in member holds a permission. */
export function useCan(): (permission: Permission) => boolean {
  const { session } = useAuth();
  return (permission) => !!session?.permissions.includes(permission);
}
