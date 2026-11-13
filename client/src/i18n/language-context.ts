import { createContext } from 'react';

import type { Locale, ScreenLocale } from '../lib/locales';
import type { ChunkFailure } from '../version/load-chunk';

/** A language whose catalogue would not load (ADR-081). */
export interface LanguageFailure {
  locale: Locale;
  /**
   * Why, as the chunk loader found it: the connection, or a newer build
   * whose page this tab has already loaded in full once within the minute
   * and whose files it still cannot read, or a real failure in this one.
   */
  why: ChunkFailure;
  /**
   * The language the app started in, or the one the account then applied
   * to it: the screens fell back to English, and a banner says so. Else a
   * switch, which left the screens as they were, and a toast says so.
   */
  atStart: boolean;
}

export interface LanguageState {
  /**
   * The language the screens are in now, as the server, the account and
   * the guides know it: English while they show en-XA.
   */
  locale: Locale;
  /** What the screens show: `locale`, or en-XA in development. */
  shown: ScreenLocale;
  /**
   * Switches the screens once the language's catalogue has loaded, and only
   * then remembers the choice on this device, so a load that fails changes
   * nothing saved (ADR-081). Resolves true once the screens are in it, or
   * false if another choice took its place or its failure was closed; a
   * failure waits for Try again. Saving it to the account is the picker's
   * business, once this resolves true: signing in applies the account's
   * choice through `follow`, and must not echo it back to the server.
   */
  setLocale: (locale: ScreenLocale) => Promise<boolean>;
  /**
   * The account's language applied on this device, as setLocale, except
   * that English leaves en-XA on the screens: to the account it is English.
   */
  follow: (locale: Locale) => Promise<boolean>;
  /** A language that would not load, until it does or is closed. */
  failure: LanguageFailure | null;
  /** Loads the failed language again. */
  retry: () => void;
  /** Closes the failure, the screens staying in the language they are in. */
  dismiss: () => void;
}

/** In a module of its own, as AuthContext is, so Fast Refresh keeps state. */
export const LanguageContext = createContext<LanguageState | null>(null);
