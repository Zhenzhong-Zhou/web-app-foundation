import { useState } from 'react';

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
 * drops its rows, and an answer that comes after is ignored.
 */
export function useOpenRows<T>(read: () => Promise<T>): {
  open: boolean;
  rows: T | null;
  busy: boolean;
  failure: unknown;
  toggle: () => void;
  retry: () => void;
} {
  const [state, setState] = useState<Opened<T>>({ ...CLOSED, ask: 0 });

  function start() {
    const ask = state.ask + 1;
    const ours = (change: (was: Opened<T>) => Opened<T>) =>
      setState((was) => (was.ask === ask ? change(was) : was));

    setState({ ...CLOSED, open: true, ask, reading: true });
    setTimeout(
      () => ours((was) => (was.reading ? { ...was, slow: true } : was)),
      INDICATOR_DELAY_MS,
    );
    void read().then(
      (rows) => ours((was) => ({ ...was, rows, reading: false })),
      (failure: unknown) =>
        ours((was) => ({ ...was, failure, reading: false })),
    );
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
