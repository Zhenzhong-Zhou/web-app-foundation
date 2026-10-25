import { useEffect } from 'react';

import { appNameIn } from './app-name';
import { DEFAULT_LOCALE, type Locale } from './locales';

/**
 * A page's part of the tab's title: its own title, and for a detail page
 * the section it sits in ("SO-DEMO-1", "Orders").
 */
interface Part {
  page: string;
  section?: string;
}

/**
 * The tab's title (ADR-082): the page's part, if any, then the product's
 * name in the reader's language. A detail page's section takes the name's
 * place, keeping its tab short (SO-DEMO-1 · Orders); a page with no part,
 * signed out or Home, is the name alone.
 */
function tabTitle(locale: Locale, part: Part | null): string {
  const name = appNameIn(locale);
  return part ? `${part.page} · ${part.section ?? name}` : name;
}

let locale: Locale = DEFAULT_LOCALE;
let part: Part | null = null;
/** Words before all of it while they hold: the sign-out countdown's. */
let prefix: string | null = null;

/**
 * Worked out again at every change, never put back: a title restored on
 * leaving a page would keep the language it was written in.
 */
function show(): void {
  const title = tabTitle(locale, part);
  document.title = prefix ? `${prefix} · ${title}` : title;
}

/** The reader's language, set by LanguageProvider with everything else. */
export function setTabLocale(next: Locale): void {
  locale = next;
  show();
}

/** Names the tab while the page is shown; leaving, the name alone. */
export function useTabTitle(page: string, section?: string): void {
  useEffect(() => {
    part = { page, section };
    show();
    return () => {
      part = null;
      show();
    };
  }, [page, section]);
}

/**
 * Puts words before the tab's title while they are given, the sign-out
 * countdown's, which a person in another window sees; null, or leaving,
 * the title alone again. Worked out with the rest, so the page or the
 * language changing under it still shows.
 */
export function useTabPrefix(words: string | null): void {
  useEffect(() => {
    prefix = words;
    show();
    return () => {
      prefix = null;
      show();
    };
  }, [words]);
}
