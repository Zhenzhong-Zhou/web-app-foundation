import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who is acting, and in which organization (ADR-004).
 *
 * Authentication alone is not enough context: every request needs both the
 * identity *and* the current organization, because permissions resolve through
 * the membership for that org.
 */
export interface TenantContext {
  userId: string;
  organizationId: string;
}

/**
 * Per-request state, carried implicitly through the async call chain.
 *
 * Nest's request-scoped providers were rejected for this. Scope propagates
 * upward: anything injecting a request-scoped provider becomes request-scoped
 * too, and so does everything above it. Since every service eventually touches
 * the database, the whole application would be rebuilt per request — and code
 * with no request at all (the seed, the ADR-012 retention job) could not
 * construct these providers in the first place.
 */
const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with tenant context bound. Called at the request edge by the auth
 * guard, and explicitly by background work that acts on one organization.
 */
export function runInTenantContext<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
