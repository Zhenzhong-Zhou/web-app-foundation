import type { Locale } from '../../common/locales';
import { dayIn } from '../../common/today';
import { type Translatable, translate } from '../../i18n/translate';
import { formatDay } from './format';

/**
 * A message in one of the document's languages. A function when a value
 * in it is itself worded per language, a tax rate's "%" or "\u00a0%";
 * either way written with t(), so i18n:extract finds it.
 */
export type Wording =
  Translatable | ((language: Locale, tag: string) => Translatable);

/** Between a bilingual label's two languages. */
const BETWEEN = ' / ';

/**
 * A document's words in its customer's languages, not the reader's
 * (ADR-054), as the print pages put them. A bilingual label gives both
 * equal weight, "Invoice / Facture", and says it once when the two agree.
 * Numbers, dates and money are written once, the first language's way.
 */
export interface DocumentText {
  /** The tag the first language formats numbers, dates and money in. */
  locale: string;
  /** A message in each language, kept apart, for lines that stack. */
  lines: (wording: Wording) => string[];
  /** The same, joined "First / Second". */
  label: (wording: Wording) => string;
  /**
   * The organization's time zone (ADR-072), which decides the day a moment
   * fell on: a shipment at 5 pm in Vancouver shipped that day.
   */
  timeZone: string;
  /**
   * The day a moment fell on in the organization's zone, written the first
   * language's way. For moments only: a calendar day, an invoice's date,
   * is written as it is with formatDay.
   */
  dayOf: (moment: string | Date) => string;
}

export function documentText(
  language: Locale,
  secondLanguage: Locale | null,
  country: string | null,
  timeZone = 'UTC',
): DocumentText {
  const languages =
    secondLanguage && secondLanguage !== language
      ? [language, secondLanguage]
      : [language];
  const tags = languages.map((each) => formattingTag(each, country));

  const lines = (wording: Wording) => {
    const said = languages.map((each, index) =>
      translate(
        typeof wording === 'function' ? wording(each, tags[index]) : wording,
        each,
      ),
    );
    // Once when both say the same: a SKU, a name with no translation.
    return said.length > 1 && said[0] === said[1] ? [said[0]] : said;
  };

  return {
    locale: tags[0],
    lines,
    label: (wording) => lines(wording).join(BETWEEN),
    timeZone,
    dayOf: (moment) => formatDay(dayIn(timeZone, moment), tags[0]),
  };
}

/**
 * The tag a language formats in: its own region when it names one, as
 * fr-CA does, or else the seller's country. English from a Canadian
 * business writes its dollars as "$12.50", as the print pages did in a
 * Canadian browser, not "CA$12.50" as English alone would.
 */
export function formattingTag(
  language: Locale,
  country: string | null,
): string {
  if (!country || /-[A-Z]{2}$/.test(language)) return language;
  try {
    return Intl.getCanonicalLocales(`${language}-${country}`)[0] ?? language;
  } catch {
    return language;
  }
}
