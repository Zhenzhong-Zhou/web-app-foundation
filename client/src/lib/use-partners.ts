import { useEffect, useState } from 'react';

import type { Partner } from '../api/types.gen';
import { api } from './api';

/**
 * The partners, fetched each time `active` turns true and again whenever
 * `again` changes while it is, for the partner pickers to list before
 * anything is typed: New order's Partner, Plan run's contract manufacturer
 * and a sample's Given to. What is typed is searched on the server
 * (PartnerPicker), as useVariants is for the item pickers.
 *
 * Read when the form opens, not when its page mounts, so a partner added a
 * moment ago in another tab is offered. The directory comes whole, retired
 * partners included; each form leaves out what it would refuse.
 */
export function usePartners(
  active: boolean,
  again?: unknown,
): {
  partners: Partner[];
  /**
   * The partners have come back, rows or a failure; the picker says it is
   * loading until then. The last answer stays while the next is read.
   */
  answered: boolean;
  /** Why the last read failed, until one works; null when none has. */
  failure: unknown;
} {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [answered, setAnswered] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    if (!active) return;

    let ignore = false;

    void api<Partner[]>('/partners')
      .then((rows) => {
        if (ignore) return;
        setPartners(rows);
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

  return { partners, answered, failure };
}
