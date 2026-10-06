import { useEffect, useState } from 'react';
import type { IntlShape, MessageDescriptor, PrimitiveType } from 'react-intl';

import { loadMessages } from '../i18n/catalogues';
import { makeIntl } from '../i18n/intl';
import { formattingLocale, type Locale } from '../lib/locales';

/** What a stored document prints in: its first language and perhaps a second. */
export interface DocumentLanguages {
  language: Locale;
  secondLanguage: Locale | null;
}

/**
 * A printed document's words, in the customer's languages rather than the
 * reader's (ADR-054). The person printing reads French; the slip they hand
 * over says what its customer reads.
 *
 * A bilingual document gives both languages equal weight: a label is
 * "Invoice / Facture", never one in small print under the other. Numbers,
 * dates and money are written once, the first language's way, since a
 * figure printed twice invites the question of which one counts.
 */
export interface DocumentText {
  /** The tag the first language formats numbers, dates and money in. */
  locale: string;
  /** The tag of each language, for a `lang` attribute on what it wrote. */
  languages: string[];
  /** A message in both languages, "First / Second"; once when they agree. */
  label: (
    descriptor: MessageDescriptor,
    values?: Record<string, PrimitiveType>,
  ) => string;
  /** Anything worded per language, joined the same way. */
  join: (word: (intl: IntlShape) => string) => string;
  /** The same, kept apart, for sentences that stack rather than join. */
  lines: (word: (intl: IntlShape) => string) => string[];
}

/** Between the two languages of a bilingual label. */
const BETWEEN = ' / ';

/**
 * The document's text once both catalogues have loaded, and null until
 * then: a document printed with one language missing would be wrong, so
 * the page waits. English is bundled; French and Chinese are the chunks
 * the language picker already fetches.
 */
export function useDocumentText(
  stored: DocumentLanguages | null,
): DocumentText | null {
  const first = stored?.language ?? null;
  const second = stored?.secondLanguage ?? null;
  const [loaded, setLoaded] = useState<{
    key: string;
    text: DocumentText;
  } | null>(null);
  const key = `${first}/${second}`;

  useEffect(() => {
    if (!first) return;
    let ignore = false;

    void Promise.all([
      loadMessages(first),
      second ? loadMessages(second) : Promise.resolve(null),
    ]).then(([firstMessages, secondMessages]) => {
      if (ignore) return;

      const tags = [first, second]
        .filter((locale): locale is Locale => locale !== null)
        .map((locale) => formattingLocale(locale, navigator.languages));
      const intls = [
        makeIntl(tags[0], firstMessages),
        ...(second && secondMessages
          ? [makeIntl(tags[1], secondMessages)]
          : []),
      ];

      const lines = (word: (intl: IntlShape) => string) => {
        const said = intls.map(word);
        // Once when both say the same: a SKU, a name with no translation.
        return said.length > 1 && said[0] === said[1] ? [said[0]] : said;
      };

      setLoaded({
        key: `${first}/${second}`,
        text: {
          locale: tags[0],
          languages: tags,
          lines,
          join: (word) => lines(word).join(BETWEEN),
          label: (descriptor, values) =>
            lines((intl) => intl.formatMessage(descriptor, values)).join(
              BETWEEN,
            ),
        },
      });
    });

    return () => {
      ignore = true;
    };
  }, [first, second]);

  return loaded?.key === key ? loaded.text : null;
}
