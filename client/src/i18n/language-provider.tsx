import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type IntlShape, RawIntlProvider } from 'react-intl';

import { setRequestLanguage } from '../lib/api';
import { setFormatLocale } from '../lib/format';
import {
  browserLocale,
  formattingLocale,
  isLocale,
  type Locale,
} from '../lib/locales';
import { ENGLISH, loadMessages, type Messages } from './catalogues';
import { makeIntl, setIntl } from './intl';
import { LanguageContext, type LanguageFailure } from './language-context';

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
  // The language itself, not the regional tag: the server matches it to
  // its own catalogues (ADR-054).
  setRequestLanguage(locale);
  document.documentElement.lang = tag;

  return { locale, intl };
}

/** A load asked for, until it loads or another takes its place. */
interface Request {
  locale: Locale;
  /** Said by the banner if it fails, rather than the toast (LanguageFailure). */
  atStart: boolean;
  /** Remembered on this device once loaded: a choice, not the start. */
  remember: boolean;
  /** Tells setLocale's caller whether the screens are in it. */
  settle: (switched: boolean) => void;
}

/**
 * The language the screens speak (ADR-054), outermost, because the theme,
 * the sign-in pages and the account all read it.
 *
 * It starts from this device's last choice, else the browser's languages;
 * signing in then applies the account's choice (AuthProvider). A language
 * other than English loads its catalogue before anything renders, so the
 * first screen is already in it, not English for a moment.
 *
 * A catalogue that will not load (ADR-081) leaves the screens as they are,
 * or in English at the start rather than a blank page, saves nothing, and
 * is published as `failure`: the toast and the banner that say so sit
 * inside the theme, and so inside this.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [initial] = useState<Locale>(
    () => storedLocale() ?? browserLocale(navigator.languages),
  );

  // English is in the bundle, so it is ready at once; anything else waits
  // for its chunk, below.
  const [active, setActive] = useState<Active | null>(() =>
    initial === 'en' ? apply('en', ENGLISH) : null,
  );
  const [failure, setFailure] = useState<LanguageFailure | null>(null);

  // Read by setLocale, which stays the same function: the account and the
  // invitation call it from effects, which would otherwise run again.
  const shown = useRef<Locale | null>(active?.locale ?? null);
  // The load asked for last, loading or failed. A later choice wins over
  // an earlier one still loading, which is ignored when it arrives.
  const latest = useRef<Request | null>(null);

  const load = useCallback((request: Request) => {
    latest.current = request;

    loadMessages(request.locale).then(
      (messages) => {
        if (latest.current !== request) return;
        latest.current = null;
        shown.current = request.locale;
        setActive(apply(request.locale, messages));
        setFailure(null);
        if (request.remember) remember(request.locale);
        request.settle(true);
      },
      () => {
        if (latest.current !== request) return;
        if (!shown.current) {
          shown.current = 'en';
          setActive(apply('en', ENGLISH));
        }
        // Kept as the latest, so Try again loads it and settles it.
        setFailure({ locale: request.locale, atStart: request.atStart });
      },
    );
  }, []);

  useEffect(() => {
    if (!shown.current) {
      load({
        locale: initial,
        atStart: true,
        remember: false,
        settle: () => undefined,
      });
    }
    // Gone: a load still out changes nothing when it arrives.
    return () => {
      latest.current = null;
    };
  }, [initial, load]);

  const setLocale = useCallback(
    (locale: Locale) =>
      new Promise<boolean>((settle) => {
        const previous = latest.current;
        previous?.settle(false);

        if (locale === shown.current) {
          latest.current = null;
          setFailure(null);
          remember(locale);
          settle(true);
          return;
        }

        load({
          locale,
          // Asked for again, as the account asks for the language it holds
          // after a start that failed: the banner goes on saying it.
          atStart: previous?.locale === locale && previous.atStart,
          remember: true,
          settle,
        });
      }),
    [load],
  );

  const retry = useCallback(() => {
    const request = latest.current;
    if (!request) return;
    // The toast goes while it tries, and comes back if it fails again; the
    // banner stays, so nothing on the page moves under someone's hand.
    if (!request.atStart) setFailure(null);
    load(request);
  }, [load]);

  const dismiss = useCallback(() => {
    latest.current?.settle(false);
    latest.current = null;
    setFailure(null);
  }, []);

  if (!active) return null;

  return (
    <LanguageContext.Provider
      value={{ locale: active.locale, setLocale, failure, retry, dismiss }}
    >
      {/* The same object helpers read through intl(), not a second one. */}
      <RawIntlProvider value={active.intl}>{children}</RawIntlProvider>
    </LanguageContext.Provider>
  );
}
