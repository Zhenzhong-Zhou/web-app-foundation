import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * How one of a list's filters is kept in the address: read from it, and
 * written to it, `null` at the filter's default, which is left out.
 */
export interface AddressFilter<T> {
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
 * Writes to the address in place, replacing the history entry, so Back
 * leaves the list rather than stepping back through each filter pressed;
 * `null` removes a key. The link's state is kept, so a page a link inside
 * the app opened still offers Back (#341).
 */
export function useAddressWrite(): (
  changes: Record<string, string | null>,
) => void {
  const [, setParams] = useSearchParams();
  const { state } = useLocation();

  return (changes) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true, state },
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
