import { useCallback } from 'react';
import { type Location, useLocation, useSearchParams } from 'react-router-dom';

import type { DayRange } from './date-range';

/**
 * How one of a list's filters is kept in the address: read from it, and
 * written to it, `null` at the filter's default, which is left out.
 */
interface AddressFilter<T> {
  read: (value: string | null) => T;
  write: (value: T) => string | null;
}

/**
 * One of the values a list knows, `fallback` for one missing or unknown:
 * `?status=confirmed`. A mistyped or an old link opens the list as it
 * always did, with no error.
 */
export function oneOf<T extends string>(
  allowed: readonly T[],
  fallback: T,
): AddressFilter<T> {
  return {
    read: (value) =>
      value !== null && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback,
    write: (value) => (value === fallback ? null : value),
  };
}

/** A switch the address turns on, `?late=1`; off is left out. */
export const flag: AddressFilter<boolean> = {
  read: (value) => value === '1',
  write: (on) => (on ? '1' : null),
};

/** A calendar day, YYYY-MM-DD (ADR-052), for a date range's from or to. */
export const day: AddressFilter<string | undefined> = {
  read: (value) =>
    value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().startsWith(value)
      ? value
      : undefined,
  write: (value) => value ?? null,
};

/**
 * A list's date range as `DateRangeFilter` takes it (#505's 59): its two
 * days read from the list's filters, by the keys the list keeps them
 * under, and a range chosen written back as one address write, so the
 * second day never starts from the address before the first.
 */
export function dayRangeProps<K extends string>(
  values: { [key in K]?: string },
  set: (changes: { [key in K]?: string }) => void,
  keys: { from: K; to: K },
): { value: DayRange; onChange: (range: DayRange) => void } {
  return {
    value: { from: values[keys.from], to: values[keys.to] },
    onChange: (range) =>
      set({ [keys.from]: range.from, [keys.to]: range.to } as {
        [key in K]?: string;
      }),
  };
}

/** A record's id, such as a location's; whether the list has it is its own. */
export const id: AddressFilter<string> = {
  read: (value) =>
    value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value
      : '',
  write: (value) => value || null,
};

/**
 * The last address a list wrote, and the address the page showed as it
 * did: while the page still shows that one, the next write starts from
 * what was written (#636).
 */
let written: { shown: Location; search: string } | null = null;

/**
 * Writes to the address in place, replacing the history entry, so Back
 * leaves the list rather than stepping back through each filter pressed;
 * `null` removes a key. The link's state is kept, so a page a link inside
 * the app opened still offers Back (#341).
 *
 * The one writer of a list's address: its filters, its sort (useListSort),
 * its search (useListSearch) and its tab (useTab), so the rule lives here
 * alone (#505's 58). The same function until the address or its state
 * changes, so an effect may depend on it.
 *
 * Each write starts from the address as it is when it runs, not as the
 * page last showed it (#636): react-router 7 shows an address in a
 * transition, which on a slow device ends after a search's wait, and a
 * search written then from the address shown put back a filter just
 * cleared. Two writes in a row each keep the other's. A value given as a
 * function is worked out from the key's value then, not as last shown:
 * Stock's open rows, a list a quick second click adds to (step 26's
 * verify).
 */
export function useAddressWrite(): (
  changes: Record<
    string,
    string | null | ((previous: string | null) => string | null)
  >,
) => void {
  const [, setParams] = useSearchParams();
  const location = useLocation();

  return useCallback(
    (changes) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(
            written?.shown === location ? written.search : previous,
          );
          for (const [key, change] of Object.entries(changes)) {
            const value =
              typeof change === 'function' ? change(next.get(key)) : change;
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          written = { shown: location, search: next.toString() };
          return next;
        },
        { replace: true, state: location.state },
      ),
    [setParams, location],
  );
}

/** Any filter, whatever its value: what `useListFilters` is given. */
interface SomeFilter {
  read: (value: string | null) => unknown;
  write: (value: never) => string | null;
}

type Values<S> = {
  [K in keyof S]: S[K] extends AddressFilter<infer T> ? T : never;
};

/**
 * A list's filters, kept in the address (ADR-091, #302), as its search is
 * (useListSearch) and its sort (useListSort):
 *
 * - Read from the address on every render, not once when the page opens,
 *   so a link to the list followed while it is open, Back, Forward and a
 *   bookmark all land on the filters they name.
 * - Written there when one is pressed, replacing the history entry; a
 *   filter at its default is left out, so the plain list keeps its plain
 *   address.
 * - A value the list does not know is ignored (`oneOf`, `day`, `id`).
 *
 * `filters` names each filter's key in the address and how it is kept;
 * changing several at once is one write, since each would otherwise start
 * from the address as it was before the others.
 */
export function useListFilters<S extends Record<string, SomeFilter>>(
  filters: S,
): [Values<S>, (changes: Partial<Values<S>>) => void] {
  const [params] = useSearchParams();
  const write = useAddressWrite();

  const values = Object.fromEntries(
    Object.entries(filters).map(([key, filter]) => [
      key,
      filter.read(params.get(key)),
    ]),
  ) as Values<S>;

  const set = (changes: Partial<Values<S>>) =>
    write(
      Object.fromEntries(
        Object.entries(changes).map(([key, value]) => [
          key,
          (filters[key] as AddressFilter<unknown>).write(value),
        ]),
      ),
    );

  return [values, set];
}
