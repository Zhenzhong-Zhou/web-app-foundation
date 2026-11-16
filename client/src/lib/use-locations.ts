import { useEffect, useState } from 'react';

import type { Location } from '../api/types.gen';
import { api } from './api';

/**
 * The organization's locations, read each time `active` turns true and
 * again whenever `again` changes while it is, as `usePartners` reads the
 * partners (#282): for a list's Location filter and a form's place, Stock
 * first. `active` false for a reader without `locations.view`, who is
 * never asked for them (ADR-080).
 *
 * The tree comes flat, every location, retired ones too; each screen keeps
 * what it offers (`leavesOf` for where stock can sit).
 */
export function useLocations(
  active: boolean,
  again?: unknown,
): {
  locations: Location[];
  /**
   * The locations have come back, rows or a failure. The last answer stays
   * while the next is read.
   */
  answered: boolean;
  /** Why the last read failed, until one works; null when none has. */
  failure: unknown;
} {
  const [locations, setLocations] = useState<Location[]>([]);
  const [answered, setAnswered] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    if (!active) return;

    let ignore = false;

    void api<Location[]>('/locations')
      .then((rows) => {
        if (ignore) return;
        setLocations(rows);
        setFailure(null);
        setAnswered(true);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setFailure(caught);
        setAnswered(true);
      });

    return () => {
      ignore = true;
    };
  }, [active, again]);

  return { locations, answered, failure };
}
