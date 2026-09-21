import { AsyncLocalStorage } from 'node:async_hooks';

/** Field name to its value before the handler changed it. */
type PreviousValues = Record<string, unknown>;

const storage = new AsyncLocalStorage<{
  previous: PreviousValues;
  context: Record<string, unknown>;
}>();

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
  storage.enterWith({ previous: {}, context: {} });
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

/**
 * Records a value the row needs that the request body does not carry.
 *
 * A receipt's body says how much and where; which item it was is on the
 * order line, which only the service loads. Without it the log reads "15
 * received" on an order of six lines. Stored as a bare value, not from/to:
 * it describes the thing acted on, it did not change.
 *
 * The same allow-list discipline as `fields` (ADR-018) applies, enforced by
 * the caller: a catalogue code or a quantity, never a note or anything that
 * names a person.
 */
export function recordContext(values: Record<string, unknown>): void {
  const store = storage.getStore();
  if (!store) return;

  Object.assign(store.context, values);
}

export function takeContext(): Record<string, unknown> | undefined {
  const context = storage.getStore()?.context;
  return context && Object.keys(context).length > 0 ? context : undefined;
}

export function takePrevious(): PreviousValues | undefined {
  const previous = storage.getStore()?.previous;
  return previous && Object.keys(previous).length > 0 ? previous : undefined;
}
