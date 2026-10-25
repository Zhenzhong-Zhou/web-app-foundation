import { vi } from 'vitest';

import type { Locale } from '../lib/locales';

/**
 * The product named as a deployment names it (ADR-082): VITE_APP_NAME,
 * Panivo, in every language, and a language's own setting over it, such
 * as `{ 'zh-Hans': '品桥' }`. vi.unstubAllGlobals undoes it.
 */
export function stubNames(own: Partial<Record<Locale, string>> = {}): void {
  vi.stubGlobal('__APP_NAMES__', {
    en: 'Panivo',
    'fr-CA': 'Panivo',
    'zh-Hans': 'Panivo',
    ...own,
  });
}
