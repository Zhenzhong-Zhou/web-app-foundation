import { useEffect, useEffectEvent, useState } from 'react';

import { INDICATOR_DELAY_MS } from './use-delayed-flag';

interface Opened<T> {
  open: boolean;
  /** Which opening the rows are for, so an answer to an earlier is ignored. */
  ask: number;
  rows: T | null;
  reading: boolean;
  /** The read has taken past the wait. */
  slow: boolean;
  failure: unknown;
}

const CLOSED = {
  open: false,
  rows: null,
  reading: false,
  slow: false,
  failure: null,
} as const;

/**
 * The rows a row opens to (ADR-093's opening row, `OpeningButton`): a
 * code's places, or a place's lots, read each time it opens, so they are
 * never older than the row above them.
 *
 * `busy` once the read has taken past 250 ms, nothing before, so a quick
 * answer never flashes "Reading…"; `failure` when it could not be read,
 * with `retry`, the partial state's Try again beside the rows. Closing it
 * drops its rows, and an answer that comes after is ignored. Whenever
 * `again` changes while it is open, as when stock has moved, it reads
 * them again, the rows shown kept until the new ones come.
 */
export function useOpenRows<T>(
  read: () => Promise<T>,
  again?: unknown,
  /** Open, and reading, from the start: a row the address names open. */
  startOpen = false,
): {
  open: boolean;
  rows: T | null;
  busy: boolean;
  failure: unknown;
  toggle: () => void;
  retry: () => void;
} {
  const [state, setState] = useState<Opened<T>>(
    startOpen
      ? { ...CLOSED, open: true, reading: true, ask: 1 }
      : { ...CLOSED, ask: 0 },
  );
  const [seen, setSeen] = useState(again);
  if (seen !== again) {
    setSeen(again);
    if (state.open) {
      setState((was) => ({
        ...was,
        ask: was.ask + 1,
        reading: true,
        slow: false,
        failure: null,
      }));
    }
  }

  // The read for each ask, and the wait before it says "Reading…".
  const readRows = useEffectEvent(read);
  const { ask, open, reading } = state;
  useEffect(() => {
    if (!open || !reading) return;
    const ours = (change: (was: Opened<T>) => Opened<T>) =>
      setState((was) => (was.ask === ask ? change(was) : was));

    const wait = setTimeout(
      () => ours((was) => (was.reading ? { ...was, slow: true } : was)),
      INDICATOR_DELAY_MS,
    );
    void readRows().then(
      (rows) => ours((was) => ({ ...was, rows, reading: false })),
      (failure: unknown) =>
        ours((was) => ({ ...was, failure, reading: false })),
    );
    return () => clearTimeout(wait);
  }, [ask, open, reading]);

  function start() {
    setState((was) => ({
      ...CLOSED,
      open: true,
      ask: was.ask + 1,
      reading: true,
    }));
  }

  function toggle() {
    if (state.open) setState((was) => ({ ...CLOSED, ask: was.ask + 1 }));
    else start();
  }

  return {
    open: state.open,
    rows: state.rows,
    busy: state.reading && state.slow,
    failure: state.failure,
    toggle,
    retry: start,
  };
}
