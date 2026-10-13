/**
 * The languages the app speaks (ADR-054), as BCP 47 tags. English is the
 * source every catalogue is translated from, and what anything missing falls
 * back to.
 *
 * Checked by the DTOs, never by a database constraint: adding a language is
 * a catalogue and an entry here, not a migration, and a stored tag no longer
 * listed falls back to English instead of failing.
 *
 * The client's list is generated from the OpenAPI document (ADR-068), where
 * this one appears as the Locale enum.
 */
export const SUPPORTED_LOCALES = ['en', 'fr-CA', 'zh-Hans'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
