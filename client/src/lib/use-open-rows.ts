import { useEffect, useEffectEvent, useState } from 'react';

import { INDICATOR_DELAY_MS } from './use-delayed-flag';

interface Opened<T> {
  /**
   * Its rows not asked for, as a closed row holds none; asking, or
   * answered, with rows or a failure.
   */
  phase: 'none' | 'reading' | 'read';
  /** Which reading the rows are for, so an answer to an earlier is ignored. */
  ask: number;
  rows: T | null;
  /** The read has taken past the wait. */
  slow: boolean;
  failure: unknown;
}

const NONE = {
  phase: 'none',
  rows: null,
  slow: false,
  failure: null,
} as const;

/** Its rows asked for afresh, the earlier answer dropped. */
const asking = <T>(was: Opened<T>): Opened<T> => ({
  ...NONE,
  phase: 'reading',
  ask: was.ask + 1,
});

/**
 * The rows a row opens to (ADR-093's opening row, `OpeningButton`): a
 * code's places, or a place's lots, read each time it opens, so they are
 * never older than the row above them.
 *
 * Whether it is open is the caller's alone, as the address says it
 * (`?open=`), and is never kept here: open, its rows are asked for; closed,
 * it holds none, and an answer that comes after is ignored. So a row the
 * address comes to name opens, whenever it does (ADR-094, S1).
 *
 * `busy` once the read has taken past 250 ms, nothing before, so a quick
 * answer never flashes "Reading…"; `failure` when it could not be read,
 * with `retry`, the partial state's Try again beside the rows. Whenever
 * `again` changes while it is open, as when stock has moved, it reads
 * them again, the rows shown kept until the new ones come.
 */
export function useOpenRows<T>(
  read: () => Promise<T>,
  open: boolean,
  again?: unknown,
): {
  rows: T | null;
  busy: boolean;
  failure: unknown;
  retry: () => void;
} {
  const [state, setState] = useState<Opened<T>>({ ...NONE, ask: 0 });
  // Brought level with `open` as it is drawn, as React adjusts state to a
  // prop: never a copy of it, only what its rows are.
  if (open && state.phase === 'none') setState(asking);
  if (!open && state.phase !== 'none') {
    setState((was) => ({ ...NONE, ask: was.ask + 1 }));
  }
  const [seen, setSeen] = useState(again);
  if (seen !== again) {
    setSeen(again);
    if (open && state.phase !== 'none') {
      setState((was) => ({
        ...was,
        phase: 'reading',
        ask: was.ask + 1,
        slow: false,
        failure: null,
      }));
    }
  }

  // The read for each ask, and the wait before it says "Reading…".
  const readRows = useEffectEvent(read);
  const { ask, phase } = state;
  useEffect(() => {
    if (phase !== 'reading') return;
    const ours = (change: (was: Opened<T>) => Opened<T>) =>
      setState((was) => (was.ask === ask ? change(was) : was));

    const wait = setTimeout(
      () =>
        ours((was) => (was.phase === 'reading' ? { ...was, slow: true } : was)),
      INDICATOR_DELAY_MS,
    );
    void readRows().then(
      (rows) => ours((was) => ({ ...was, rows, phase: 'read' })),
      (failure: unknown) => ours((was) => ({ ...was, failure, phase: 'read' })),
    );
    return () => clearTimeout(wait);
  }, [ask, phase]);

  return {
    rows: state.rows,
    busy: state.phase === 'reading' && state.slow,
    failure: state.failure,
    retry: () => setState(asking),
  };
}
