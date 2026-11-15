import type { IntlShape } from 'react-intl';

import { SEPARATOR } from '../lib/format';
import { languageWord, type Locale } from '../lib/locales';

/**
 * The Documents tab's Item names section, where the language items are
 * named in is chosen: the hash a link to it lands by.
 */
export const ITEM_NAMES_HASH = '#item-names';

/**
 * What a name field says under it once the organization has said which
 * language its items are named in (ADR-054, amended for #531): "In
 * Chinese", in Add item, Edit and the variant dialogs alike; nothing while
 * it is not set, since the own name then has no language. The field's own
 * help, when it has one, follows it.
 */
export function typedIn(
  language: Locale | null,
  intl: IntlShape,
  help?: string,
): string | undefined {
  const typed =
    language &&
    intl.formatMessage(
      { id: 'products.name.typedIn', defaultMessage: 'In {language}' },
      { language: languageWord(language, intl.locale) },
    );
  return [typed, help].filter(Boolean).join(SEPARATOR) || undefined;
}
