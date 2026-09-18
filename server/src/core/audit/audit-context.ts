import { AsyncLocalStorage } from 'node:async_hooks';

/** Field name to its value before the handler changed it. */
type PreviousValues = Record<string, unknown>;

const storage = new AsyncLocalStorage<{ previous: PreviousValues }>();

/**
 * Opens a store for this request.
 *
 * enterWith rather than run: next.handle() returns a cold observable, so the
 * route handler executes when Nest subscribes — after intercept has returned,
 * and outside any run() callback. The store would be gone before the service
 * ever called recordPrevious.
 *
 * enterWith sets it for the current async context and everything downstream of
 * it, which is the rest of the request. This is why nestjs-cls does the same.
 */
export function enterAuditContext(): void {
  storage.enterWith({ previous: {} });
}

/**
 * Records what a field was before the handler changed it.
 *
 * Called by the service, which is the only place that has the old row — the
 * interceptor runs after the handler and never sees it. Async-local rather
 * than a parameter, for the same reason the tenant is: threading it through
 * every signature would make the audit log a concern of code that has no
 * other interest in it.
 *
 * A no-op outside a request, so a seed script or a test calling a service
 * directly needs no special case.
 */
export function recordPrevious(values: PreviousValues): void {
  const store = storage.getStore();
  if (!store) return;

  // Merged rather than replaced: a handler that updates a header and a line
  // calls this twice, and the second should not erase the first.
  Object.assign(store.previous, values);
}

export function takePrevious(): PreviousValues | undefined {
  const previous = storage.getStore()?.previous;
  return previous && Object.keys(previous).length > 0 ? previous : undefined;
}
