import type { Locale } from '../../src/common/locales';
import english from '../../src/i18n/en.json';
import { type MessageValue, t, translate } from '../../src/i18n/translate';

/** A message id of the server's catalogue. */
export type MessageId = keyof typeof english;

/**
 * A message as the server says it in a language, read by its id through
 * the catalogue: what a test checks a refusal or a line against, so it
 * checks which message was sent, and a review that rewords a translation
 * changes no test. Whether the words are right is the catalogue checks'
 * job (`npm run i18n:check`, `scripts/i18n-rules.mjs`); a test whose point
 * is the exact words, as a mail's text part, keeps them typed.
 */
export function said(
  locale: Locale,
  id: MessageId,
  values?: Record<string, MessageValue>,
): string {
  return translate(t({ id, defaultMessage: english[id] }, values), locale);
}
