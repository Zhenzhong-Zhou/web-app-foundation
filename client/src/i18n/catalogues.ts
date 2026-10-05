import type { MessageFormatElement } from 'react-intl';

import type { Locale } from '../lib/locales';
import english from './compiled/en.json';

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
 * from reaching a release; this keeps it from reaching a screen.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === 'en') return ENGLISH;
  return { ...ENGLISH, ...((await LOADERS[locale]()) as Messages) };
}
