import { createContext } from 'react';

/**
 * A button after the message, "Open the order" (55a), its click the
 * caller's: the toast sits outside the router, the caller inside it.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * One button, or a few in their order: a lot made at receipt offers Copy
 * code and Open the lot (ADR-094, E3).
 */
export type ShowToast = (
  message: string,
  action?: ToastAction | readonly ToastAction[],
) => void;

/**
 * A no-op by default, so a component rendered outside the provider — a
 * dialog in a unit test, say — still works. Confirmation is a courtesy, and
 * missing it must never break the action it confirms.
 *
 * Its own file, like auth-context.ts: fast refresh can only hot-reload a
 * module that exports components alone, so the context, the provider and
 * the hook each live apart.
 */
export const ToastContext = createContext<ShowToast>(() => undefined);
