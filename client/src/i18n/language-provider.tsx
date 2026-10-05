import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { IntlProvider } from 'react-intl';

import { setFormatLocale } from '../lib/format';
import {
  browserLocale,
  formattingLocale,
  isLocale,
  type Locale,
} from '../lib/locales';
import { ENGLISH, loadMessages, type Messages } from './catalogues';
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

/**
 * Points the formatters and <html lang> at a language, in the step that
 * also swaps the messages, so no screen renders half in one and half in
 * the other. lang is what screen readers pronounce by and what browsers
 * choose Chinese glyph forms by.
 */
function apply(locale: Locale): string {
  const tag = formattingLocale(locale, navigator.languages);
  setFormatLocale(tag);
  document.documentElement.lang = tag;
  return tag;
}

/**
 * A message missing from every catalogue — added in code and not yet
 * extracted — shows its English and says so in development. Anything else
 * the formatter reports is a real fault and is logged as one.
 */
function reportIntlError(error: { code?: string; message: string }): void {
  if (error.code === 'MISSING_TRANSLATION') {
    if (import.meta.env.DEV) console.warn(error.message);
    return;
  }
  console.error(error);
}

interface Active {
  locale: Locale;
  /** What Intl formats with: the language, in the browser's region. */
  tag: string;
  messages: Messages;
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
    wanted === 'en'
      ? { locale: 'en', tag: apply('en'), messages: ENGLISH }
      : null,
  );

  useEffect(() => {
    if (active?.locale === wanted) return;

    let ignore = false;

    void loadMessages(wanted).then((messages) => {
      // A later choice wins over an earlier one still loading.
      if (!ignore) setActive({ locale: wanted, tag: apply(wanted), messages });
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
      <IntlProvider
        locale={active.tag}
        defaultLocale="en"
        messages={active.messages}
        onError={reportIntlError}
      >
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  );
}
