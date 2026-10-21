import { createContext } from 'react';

/**
 * Whether a page asks for the address to be confirmed itself, so the
 * banner that asks the same steps aside: Home, while its welcome lists
 * Confirm your email address (ADR-079). A no-op outside the frame.
 *
 * Its own file, as toast-context.ts is, so fast refresh keeps state.
 */
export const UnverifiedBannerContext = createContext<
  (covered: boolean) => void
>(() => undefined);
