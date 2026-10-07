import { intl } from '../i18n/intl';

/**
 * Marks rather than words: what a screen shows for a value that is not
 * there, and what sits between two values on one line. The same in every
 * language, and named so no bare string sits in a screen's JSX, where the
 * no-literal lint rule would rightly ask whether it needs translating
 * (ADR-054).
 */
export const NO_VALUE = '—';
export const SEPARATOR = ' · ';
/** A helper line kept blank, so a field does not jump when it fills. */
export const BLANK_LINE = ' ';

/**
 * The tag every formatter here uses (ADR-054): the chosen language, in the
 * browser's own region when it is the same language (formattingLocale in
 * locales.ts). LanguageProvider sets it before the screens render in a new
 * language. Undefined until then, which is the browser's own, as before.
 *
 * A module value rather than a hook, because these are plain functions
 * called from render, from column definitions and from handlers alike. A
 * print page passes the document's language explicitly instead.
 */
let current = import.meta.hot?.data?.locale as string | undefined;

/** Kept in Vite's hot data too, for the reason given in i18n/intl.ts. */
export function setFormatLocale(locale: string): void {
  current = locale;
  if (import.meta.hot?.data) import.meta.hot.data.locale = locale;
}

/** Intl formatters are costly to build and cheap to keep: one per key. */
const formatters = new Map<string, unknown>();

function cached<T>(key: string, make: () => T): T {
  let formatter = formatters.get(key) as T | undefined;
  if (formatter === undefined) {
    formatter = make();
    formatters.set(key, formatter);
  }
  return formatter;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

/**
 * "2 hours ago". Intl rather than a date library — this is the only place a
 * relative time is needed, and adding one for it would cost more than it
 * saves.
 *
 * Note last_seen_at is throttled to one write a minute server-side, so
 * "just now" can be up to a minute stale. Fine for this display.
 */
export function relativeTime(
  value: string | Date,
  locale: string | undefined = current,
): string {
  const elapsed = new Date(value).getTime() - Date.now();
  const relative = cached(
    `relative:${locale}`,
    () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
  );

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return relative.format(Math.round(elapsed / ms), unit);
    }
  }

  return intl().formatMessage({
    id: 'common.justNow',
    defaultMessage: 'just now',
  });
}

/**
 * "12 Sep 2026" for a moment in time — when a run was planned, when a row was
 * created. Absolute rather than relative, unlike relativeTime above, and in
 * the browser's timezone, because a moment happened at a local time.
 *
 * Not for calendar days. Use formatDay for those.
 */
/**
 * A moment in full, as a tooltip shows it: the browser's own form, in the
 * reader's language — the same output toLocaleString() always gave an
 * English reader, now in the chosen language for everyone else.
 */
export function formatMoment(
  value: string | Date,
  locale: string | undefined = current,
): string {
  return new Date(value).toLocaleString(locale);
}

/**
 * "Shelf 3 (A-01-03)": a name with its code beside it, as on a label, or
 * the name alone when there is no code. Data, not words, so the same in
 * every language.
 */
export function nameAndCode(name: string, code: string | null): string {
  return code ? `${name} (${code})` : name;
}

export function formatDate(
  value: string | Date,
  locale: string | undefined = current,
): string {
  return cached(
    `date:${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
  ).format(new Date(value));
}

/**
 * "10 Oct 2026" for a calendar day — an expiry, an expected delivery, a
 * licence's dates, an invoice date. The API sends and takes these as
 * YYYY-MM-DD (ADR-052), so a form sends the date input's value as typed and
 * prefills from the value as it arrives.
 *
 * Read in UTC on purpose. `new Date('2026-10-10')` is midnight UTC, and read
 * in the browser's zone — as formatDate does — anywhere west of Greenwich
 * that is still 9 Oct: how a lot expiring 10 Oct once showed as 9 Oct in
 * Vancouver. In UTC the day comes back exactly, wherever the browser is.
 *
 * Also reads the full instants audit rows written before ADR-052 still hold,
 * which were stored as UTC midnight of the day picked.
 */
export function formatDay(
  value: string | Date,
  locale: string | undefined = current,
): string {
  return cached(
    `day:${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
  ).format(new Date(value));
}

/**
 * A money amount in its own currency.
 *
 * Intl knows each currency's minor units, so JPY renders without decimals and
 * CAD with two — which is why the server returns the number unrounded and
 * leaves this decision here (ADR-035).
 *
 * The amount arrives as a string from numeric(18,4) and is parsed only at the
 * point of display. Nothing computed from it is ever stored.
 */
export function formatMoney(
  amount: string | null,
  currency: string | null,
  locale: string | undefined = current,
): string {
  if (amount === null) return '—';
  if (!currency) return amount;

  return cached(
    `money:${locale}:${currency}`,
    () => new Intl.NumberFormat(locale, { style: 'currency', currency }),
  ).format(Number(amount));
}

/**
 * A credit, as money going back: a minus sign before the amount, in the
 * currency's format (ADR-055). On credit notes and an order's credited
 * figure, so a reader never mistakes a credit for something more owed. A
 * true minus (U+2212), not a hyphen.
 */
export function formatCredit(
  amount: string | null,
  currency: string | null,
  locale: string | undefined = current,
): string {
  return `\u2212${formatMoney(amount, currency, locale)}`;
}

/**
 * A unit cost, with the places a currency's minor units would hide: a
 * capsule at 0.0123 is not 0.01. Up to four, never fewer than the currency's
 * own. Display only, as formatMoney is.
 */
export function formatUnitCost(
  amount: string | null,
  currency: string | null,
  locale: string | undefined = current,
): string {
  if (amount === null) return '—';
  if (!currency) return amount;

  return cached(
    `unit-cost:${locale}:${currency}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 4,
      }),
  ).format(Number(amount));
}

/** The language's decimal and grouping separators: "." and "," in English. */
function separators(locale: string | undefined) {
  return cached(`separators:${locale}`, () => {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
      group: parts.find((part) => part.type === 'group')?.value ?? ',',
    };
  });
}

/**
 * A quantity as the language writes it: "35,0000" in French, "35.0000" in
 * English, exactly as today. The separator is swapped on the string itself
 * and nothing else changes — no JavaScript number, so no rounding (ADR-025),
 * and the digits and trailing zeros stay as they arrived.
 */
export function formatQuantity(
  value: string,
  locale: string | undefined = current,
): string {
  const { decimal } = separators(locale);
  return decimal === '.' ? value : value.replace('.', decimal);
}

/**
 * A quantity to read (ADR-055): no padding zeros, and grouped the
 * language's way. "600.0000" reads "600", "1000.0000" "1,000",
 * "1234.5000" "1 234,5" in French.
 *
 * String work only, like formatQuantity: no JavaScript number, so nothing
 * is rounded (ADR-025). For reading, never for a field: a field shows what
 * toApiDecimal accepts back, and it refuses grouped digits, so fields keep
 * formatQuantity.
 */
export function displayQuantity(
  value: string,
  locale: string | undefined = current,
): string {
  const { decimal, group } = separators(locale);
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const kept = fraction.replace(/0+$/, '');

  return `${negative ? '-' : ''}${grouped}${kept ? decimal + kept : ''}`;
}

/**
 * What a quantity or price field says when toApiDecimal refuses what was
 * typed, with an example written the language's way ("1234,5" in French).
 */
export function groupedNumberMessage(): string {
  return intl().formatMessage(
    {
      id: 'common.decimal.grouped',
      defaultMessage:
        'Type the number without separators between thousands, as in {example}.',
    },
    { example: formatQuantity('1234.5') },
  );
}

/**
 * What a quantity or price field sends: the text typed, with the language's
 * decimal separator turned into the point the API takes, so the API's
 * format never changes (ADR-054). "1,5" in French is "1.5"; a point typed
 * in French is accepted as it is, since French groups with a space.
 *
 * Null when the text holds a grouping separator, a space or two kinds of
 * separator: "1,234" might be a thousand or one and a bit, and guessing
 * wrong on a quantity is worse than asking. Everything else is left for the
 * server's own check, as before.
 */
export function toApiDecimal(
  text: string,
  locale: string | undefined = current,
): string | null {
  const { decimal, group } = separators(locale);
  const trimmed = text.trim();

  if (/\s/.test(trimmed) || (group !== decimal && trimmed.includes(group))) {
    return null;
  }

  if (decimal === '.') return trimmed;
  if (trimmed.includes('.') && trimmed.includes(decimal)) return null;
  return trimmed.replace(decimal, '.');
}

/** "Focus (60ct)", or "Focus" when the variant has no name — the server's itemName rule. */
export function itemName(
  productName: string,
  variantName: string | null,
): string {
  return variantName ? `${productName} (${variantName})` : productName;
}
