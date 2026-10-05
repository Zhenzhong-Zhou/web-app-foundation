import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { type IntlShape, RawIntlProvider } from 'react-intl';

import { setFormatLocale } from '../lib/format';
import {
  browserLocale,
  formattingLocale,
  isLocale,
  type Locale,
} from '../lib/locales';
import { ENGLISH, loadMessages, type Messages } from './catalogues';
import { makeIntl, setIntl } from './intl';
import { LanguageContext } from './language-context';

/** This device's last choice, so the sign-in page opens in it. */
const STORAGE_KEY = 'language';

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // Storage refused (a locked-down browser): the browser's language it is.
    return null;
  }
}

function remember(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not remembered on this device; the account still carries it.
  }
}

interface Active {
  locale: Locale;
  intl: IntlShape;
}

/**
 * Points everything at a language in one step, so no screen renders half
 * in one and half in the other: the formatters, the intl object helpers
 * use, and <html lang>, which screen readers pronounce by and browsers
 * choose Chinese glyph forms by. The tag is the language in the browser's
 * own region (formattingLocale).
 */
function apply(locale: Locale, messages: Messages): Active {
  const tag = formattingLocale(locale, navigator.languages);
  const intl = makeIntl(tag, messages);

  setFormatLocale(tag);
  setIntl(intl);
  document.documentElement.lang = tag;

  return { locale, intl };
}

/**
 * The language the screens speak (ADR-054), outermost, because the theme,
 * the sign-in pages and the account all read it.
 *
 * It starts from this device's last choice, else the browser's languages;
 * signing in then applies the account's choice (AuthProvider). A language
 * other than English loads its catalogue before anything renders, so the
 * first screen is already in it, not English for a moment.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [wanted, setWanted] = useState<Locale>(
    () => storedLocale() ?? browserLocale(navigator.languages),
  );

  // English is in the bundle, so it is ready at once; anything else waits
  // for its chunk, below.
  const [active, setActive] = useState<Active | null>(() =>
    wanted === 'en' ? apply('en', ENGLISH) : null,
  );

  useEffect(() => {
    if (active?.locale === wanted) return;

    let ignore = false;

    void loadMessages(wanted).then((messages) => {
      // A later choice wins over an earlier one still loading.
      if (!ignore) setActive(apply(wanted, messages));
    });

    return () => {
      ignore = true;
    };
  }, [wanted, active?.locale]);

  const setLocale = useCallback((locale: Locale) => {
    remember(locale);
    setWanted(locale);
  }, []);

  if (!active) return null;

  return (
    <LanguageContext.Provider value={{ locale: active.locale, setLocale }}>
      {/* The same object helpers read through intl(), not a second one. */}
      <RawIntlProvider value={active.intl}>{children}</RawIntlProvider>
    </LanguageContext.Provider>
  );
}
