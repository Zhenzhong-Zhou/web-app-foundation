import type { Location } from '../api/types.gen';
import { useResource } from './use-resource';

/**
 * The organization's locations, read when `active` turns true, as every
 * page's read is (useResource): for a list's Location filter and a form's
 * place, Stock first. `active` false for a reader without
 * `locations.view`, who is never asked for them (ADR-080).
 *
 * The tree comes flat, every location, retired ones too; each screen keeps
 * what it offers (`leavesOf` for where stock can sit).
 */
export function useLocations(active: boolean): {
  locations: Location[];
  /**
   * The locations have come back, rows or a failure. The last answer stays
   * while the next is read.
   */
  answered: boolean;
  /** Why the last read failed, until one works; null when none has. */
  failure: unknown;
  /** Asks again, Try again's (ADR-092's states). */
  retry: () => void;
} {
  const { data, failure, reload } = useResource<Location[]>(
    active ? '/locations' : null,
  );

  return {
    locations: data ?? [],
    answered: data !== null || failure !== null,
    failure,
    retry: () => void reload(),
  };
}
