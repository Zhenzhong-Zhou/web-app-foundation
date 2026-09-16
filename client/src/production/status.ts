import type { RunStatus } from '../lib/types';

/**
 * Worded as the state of the work rather than the state of the row: "released"
 * means nothing to somebody who has not read ADR-032, and the person reading
 * this screen is the one doing the work.
 */
export const STATUS_LABEL: Record<RunStatus, string> = {
  draft: 'Planned',
  released: 'In progress',
  completed: 'Finished',
  cancelled: 'Cancelled',
};

export const STATUS_COLOUR: Record<
  RunStatus,
  'default' | 'primary' | 'success'
> = {
  draft: 'default',
  released: 'primary',
  completed: 'success',
  cancelled: 'default',
};
