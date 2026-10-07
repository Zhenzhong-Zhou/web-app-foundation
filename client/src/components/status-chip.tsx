import { Chip, type ChipProps } from '@mui/material';

import type { ToneName } from '../theme/tokens';

/** The chip colour the theme draws each tone with (theme/index.ts). */
const COLOR_OF_TONE: Record<ToneName, ChipProps['color']> = {
  neutral: 'default',
  info: 'info',
  positive: 'success',
  warning: 'warning',
  critical: 'error',
};

/**
 * A status, in its tone (ADR-055). The words carry the meaning and the tone
 * says what kind it is, so nothing is told by colour alone. Take the tone
 * from STATUS_TONES (theme/status.ts), never from a colour of the page's
 * own.
 */
export function StatusChip({ tone, label }: { tone: ToneName; label: string }) {
  return <Chip size="small" label={label} color={COLOR_OF_TONE[tone]} />;
}
