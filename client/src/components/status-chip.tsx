import { Chip } from '@mui/material';

import { COLOR_OF_TONE } from '../theme/status';
import type { ToneName } from '../theme/tokens';

/**
 * A status, in its tone (ADR-055). The words carry the meaning and the tone
 * says what kind it is, so nothing is told by colour alone. Take the tone
 * from STATUS_TONES (theme/status.ts), never from a colour of the page's
 * own.
 */
export function StatusChip({ tone, label }: { tone: ToneName; label: string }) {
  return <Chip size="small" label={label} color={COLOR_OF_TONE[tone]} />;
}
