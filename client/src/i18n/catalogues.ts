import type { MessageFormatElement } from 'react-intl';

import { isLocale, type Locale, type ScreenLocale } from '../lib/locales';
import { loadChunkOrReload } from '../version/load-chunk';
import english from './compiled/en.json';
import { pseudoMessages } from './pseudo';

/**
 * A catalogue as the browser reads it: each message already parsed into
 * ICU's tree at build (`npm run i18n:compile`, from src/locales), so the
 * parser never ships in production (vite.config.ts aliases it away there).
 * The compiled files are generated, not committed.
 */
export type Messages = Record<string, MessageFormatElement[]>;

/** Ships with the app: the source language, and every other one's floor. */
export const ENGLISH = english as unknown as Messages;

/**
 * Each other language a chunk of its own, fetched the first time someone
 * chooses it, so an English reader downloads nothing extra.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<unknown>> = {
  'fr-CA': () => import('./compiled/fr-CA.json').then((m) => m.default),
  'zh-Hans': () => import('./compiled/zh-Hans.json').then((m) => m.default),
};

/**
 * A language's messages over the English ones: a message the catalogue
 * lacks reads in English, never as its id. `npm run i18n:check` keeps that
 * from reaching a release; this keeps it from reaching a screen. Its chunk
 * loads as a page's does (ADR-081): when a newer build is why it failed,
 * the page loads in full from it rather than saying so.
 *
 * en-XA is made here from the English, in development and the browser
 * tests; a production build, which never offers it, drops the branch and
 * pseudo.ts with it (vite.config.ts's `withoutPseudoLanguage`).
 */
export async function loadMessages(locale: ScreenLocale): Promise<Messages> {
  if (!isLocale(locale)) {
    return import.meta.env.DEV ? pseudoMessages(ENGLISH) : ENGLISH;
  }
  if (locale === 'en') return ENGLISH;
  return {
    ...ENGLISH,
    ...((await loadChunkOrReload(LOADERS[locale])) as Messages),
  };
}
