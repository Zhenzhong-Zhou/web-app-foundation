import type { SelectProps } from '@mui/material/Select';

/**
 * What the account menu's row hands the select it holds, so Enter or
 * Space on the row opens it (#151), and the id of the row's visible label,
 * which then names it (ADR-091). Elsewhere a select opens itself and is
 * named by its own aria-label.
 */
export type PreferenceControl = Pick<
  SelectProps,
  'open' | 'onOpen' | 'onClose' | 'labelId'
>;
