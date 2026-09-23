import { createContext } from 'react';

export type ShowToast = (message: string) => void;

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
