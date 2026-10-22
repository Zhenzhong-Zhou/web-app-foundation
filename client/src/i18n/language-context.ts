import { createContext } from 'react';

import type { Locale } from '../lib/locales';

/** A language whose catalogue would not load (ADR-081). */
export interface LanguageFailure {
  locale: Locale;
  /**
   * The language the app started in, or the one the account then applied
   * to it: the screens fell back to English, and a banner says so. Else a
   * switch, which left the screens as they were, and a toast says so.
   */
  atStart: boolean;
}

export interface LanguageState {
  /** The language the screens are in now. */
  locale: Locale;
  /**
   * Switches the screens once the language's catalogue has loaded, and only
   * then remembers the choice on this device, so a load that fails changes
   * nothing saved (ADR-081). Resolves true once the screens are in it, or
   * false if another choice took its place or its failure was closed; a
   * failure waits for Try again. Saving it to the account is the picker's
   * business, once this resolves true: signing in applies the account's
   * choice through here too, and must not echo it back to the server.
   */
  setLocale: (locale: Locale) => Promise<boolean>;
  /** A language that would not load, until it does or is closed. */
  failure: LanguageFailure | null;
  /** Loads the failed language again. */
  retry: () => void;
  /** Closes the failure, the screens staying in the language they are in. */
  dismiss: () => void;
}

/** In a module of its own, as AuthContext is, so Fast Refresh keeps state. */
export const LanguageContext = createContext<LanguageState | null>(null);
