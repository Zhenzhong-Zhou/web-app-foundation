import type { SelectProps } from '@mui/material/Select';

/**
 * What the account menu's row hands the select it holds, so Enter or
 * Space on the row opens it (#151). Elsewhere a select opens itself.
 */
export type PreferenceControl = Pick<
  SelectProps,
  'open' | 'onOpen' | 'onClose'
>;
