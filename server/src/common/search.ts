import { type SQL, sql, type SQLWrapper } from 'drizzle-orm';

/**
 * How every search in the app matches (ADR-056), in one place, so a record
 * the lookup finds, its list finds too.
 *
 * - Anywhere in the text, case ignored: "2609" finds FOC-2609-01.
 * - Names with accents and punctuation ignored, through search_text
 *   (migrations 0042, 0043): "eleuthero" finds "Éleuthéro", "saint
 *   laurent" finds "Saint-Laurent". Codes compared as stored.
 * - Chinese names also by their pinyin, full or initials, when the query is
 *   Latin letters and digits: "yuyou" and "shyy" find 深海鱼油, and so does
 *   "yúyóu", its tone marks set aside.
 * - Full-width letters, digits and punctuation read as their usual forms:
 *   "ＦＯＣ" finds FOC-2609-01.
 * - % and _ match themselves: they are escaped, never wildcards.
 *
 * The lookup asks for at least MIN_SEARCH_LENGTH characters, or one Chinese
 * character (lookupLongEnough); a list narrows by whatever it is given.
 */
export const MIN_SEARCH_LENGTH = 2;

/** One Chinese character and nothing else: 鱼, 胶. */
const ONE_HAN = /^\p{Script=Han}$/u;

/**
 * Whether a query, trimmed, is long enough for the lookup (ADR-056): at
 * least MIN_SEARCH_LENGTH characters, or one Chinese character, which is
 * what a Chinese reader types, where one letter would match nearly
 * everything in seven kinds at once. A list searches one kind and takes any
 * length. The top bar asks by the same rule
 * (client/src/search/lookup-minimum.ts).
 */
export function lookupLongEnough(raw: string): boolean {
  const text = raw.trim();
  return text.length >= MIN_SEARCH_LENGTH || ONE_HAN.test(text);
}

/** What a query becomes before it is matched. */
export interface SearchTerms {
  /** Trimmed, inner runs of spaces read as one. */
  text: string;
  /** The text with LIKE's wildcards escaped. */
  exact: string;
  /** Starts with the text. */
  prefix: string;
  /** Contains the text. */
  anywhere: string;
  /**
   * The query as pinyin is stored, lower-case letters and digits only; null
   * when the query has too few of them to be pinyin.
   */
  pinyinText: string | null;
  /** pinyinText as a contains-pattern. */
  pinyin: string | null;
  /**
   * Whether the query has anything to match a name with once punctuation
   * and spaces are set aside; "--" has not, and matches no name rather
   * than every name.
   */
  hasWords: boolean;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Pinyin's four tone marks over a vowel, once decomposed: ā á ǎ à. */
const TONE_MARKS = /[\u0300\u0301\u0304\u030c]/g;

export function searchTerms(raw: string): SearchTerms {
  // Full width (全角), as an input method can type it, read as usual:
  // ＦＯＣ－２６０９ is FOC-2609, and its wide space a space.
  const text = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const exact = escapeLike(text);
  // Pinyin is stored without tones, so zhuānzhù is zhuanzhu; ü keeps its
  // dots and goes with the rest, as namePinyin leaves it out.
  const latin = text
    .normalize('NFD')
    .replace(TONE_MARKS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const pinyinText = latin.length >= MIN_SEARCH_LENGTH ? latin : null;

  return {
    text,
    exact,
    prefix: `${exact}%`,
    anywhere: `%${exact}%`,
    pinyinText,
    pinyin: pinyinText === null ? null : `%${pinyinText}%`,
    hasWords: /[\p{L}\p{N}]/u.test(text),
  };
}

/** A code (a number, a reference, a SKU, a lot code), case ignored. */
export function codeMatches(column: SQLWrapper, terms: SearchTerms): SQL {
  return sql`${column} ilike ${terms.anywhere}`;
}

/**
 * A name, with accents, case and punctuation ignored on both sides:
 * search_text() turns "Pharmacie Saint-Laurent" into "pharmacie saint
 * laurent" and the query "saint  laurent" into "saint laurent". LIKE's
 * wildcards are punctuation, so the query needs no escaping here.
 */
export function nameMatches(column: SQLWrapper, terms: SearchTerms): SQL {
  if (!terms.hasWords) return sql`false`;
  return sql`search_text(${column}) like '%' || search_text(${terms.text}) || '%'`;
}

/**
 * A name's pinyin column (name_pinyin), or nothing to add when the query
 * cannot be pinyin. Stored lower case without spaces, so a plain LIKE.
 */
export function pinyinMatches(
  column: SQLWrapper,
  terms: SearchTerms,
): SQL | undefined {
  return terms.pinyin === null
    ? undefined
    : sql`${column} like ${terms.pinyin}`;
}

function comparable(
  column: SQLWrapper,
  kind: 'code' | 'name',
): { value: SQL; wrap: (text: string) => SQL } {
  return kind === 'name'
    ? {
        value: sql`search_text(${column})`,
        wrap: (text) => sql`search_text(${text})`,
      }
    : { value: sql`${column}`, wrap: (text) => sql`${text}` };
}

/**
 * For ORDER BY, lowest first: 0 for an exact match, 1 for a match at the
 * start, 2 for anywhere (ADR-056). Names compared as nameMatches compares
 * them, codes case ignored.
 */
export function matchRank(
  column: SQLWrapper,
  terms: SearchTerms,
  kind: 'code' | 'name' = 'code',
): SQL {
  if (kind === 'name') {
    const query = sql`search_text(${terms.text})`;
    return sql`case
      when search_text(${column}) = ${query} then 0
      when search_text(${column}) like ${query} || '%' then 1
      else 2
    end`;
  }
  return sql`case
    when lower(${column}) = lower(${terms.text}) then 0
    when ${column} ilike ${terms.prefix} then 1
    else 2
  end`;
}

/**
 * A name's pinyin column, ranked as matchRank ranks: exact when the query is
 * the full pinyin or the initials ("zhuanzhu" or "zz" for 专注), at the
 * start when either starts with it. Nothing to add when the query cannot be
 * pinyin, as pinyinMatches.
 */
export function pinyinRank(
  column: SQLWrapper,
  terms: SearchTerms,
): SQL | undefined {
  if (terms.pinyinText === null) return undefined;
  const full = sql`split_part(${column}, ' ', 1)`;
  const initials = sql`split_part(${column}, ' ', 2)`;
  const prefix = `${terms.pinyinText}%`;
  return sql`case
    when ${full} = ${terms.pinyinText} or ${initials} = ${terms.pinyinText} then 0
    when ${full} like ${prefix} or ${initials} like ${prefix} then 1
    else 2
  end`;
}

/** The best of several ranks, leaving out those with nothing to add. */
export function bestRank(...ranks: (SQL | undefined)[]): SQL {
  const given = ranks.filter((rank): rank is SQL => rank !== undefined);
  return sql`least(${sql.join(given, sql`, `)})`;
}

/**
 * Close matches, for typos (ADR-056): "fokus" to "Focus 60ct". Postgres's
 * word similarity between the query and the closest stretch of the text,
 * above CLOSE_MATCH_THRESHOLD. The `<%` operator compares against
 * pg_trgm.word_similarity_threshold, so a transaction that asks for close
 * matches first runs closeMatchSetting, which sets it for that transaction
 * only; the operator is what lets the trigram index serve the query.
 */
export const CLOSE_MATCH_THRESHOLD = 0.3;

export const closeMatchSetting = sql`select set_config('pg_trgm.word_similarity_threshold', ${String(CLOSE_MATCH_THRESHOLD)}, true)`;

/** Whether the text is a close match for the query. */
export function closeMatches(
  column: SQLWrapper,
  terms: SearchTerms,
  kind: 'code' | 'name' = 'code',
): SQL {
  const { value, wrap } = comparable(column, kind);
  return sql`${wrap(terms.text)} <% ${value}`;
}

/** How close, from 0 to 1, for ORDER BY … desc. */
export function closeness(
  column: SQLWrapper,
  terms: SearchTerms,
  kind: 'code' | 'name' = 'code',
): SQL {
  const { value, wrap } = comparable(column, kind);
  return sql`word_similarity(${wrap(terms.text)}, ${value})`;
}
