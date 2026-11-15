import type { IntlShape } from 'react-intl';

import { languageWord, type Locale } from '../lib/locales';

/**
 * What a name field says under it once the organization has said which
 * language its items are named in (ADR-054, amended for #531): "In
 * Chinese", in Add item, Edit and the variant dialogs alike; nothing while
 * it is not set, since the own name then has no language.
 */
export function typedIn(
  language: Locale | null,
  intl: IntlShape,
): string | undefined {
  if (!language) return undefined;
  return intl.formatMessage(
    { id: 'products.name.typedIn', defaultMessage: 'In {language}' },
    { language: languageWord(language, intl.locale) },
  );
}
