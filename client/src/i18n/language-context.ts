import { createContext } from 'react';

import type { Locale } from '../lib/locales';

export interface LanguageState {
  /** The language the screens are in now. */
  locale: Locale;
  /**
   * Switches the screens and remembers the choice on this device. Saving it
   * to the account is the picker's business, not this one's: signing in
   * applies the account's choice through here too, and must not echo it
   * back to the server.
   */
  setLocale: (locale: Locale) => void;
}

/** In a module of its own, as AuthContext is, so Fast Refresh keeps state. */
export const LanguageContext = createContext<LanguageState | null>(null);
