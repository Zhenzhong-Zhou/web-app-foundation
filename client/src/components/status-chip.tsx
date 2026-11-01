import { Chip } from '@mui/material';
import type { ReactElement } from 'react';

import { COLOR_OF_TONE } from '../theme/status';
import type { ToneName } from '../theme/tokens';

/**
 * A status, in its tone (ADR-055). The words carry the meaning and the tone
 * says what kind it is, so nothing is told by colour alone. Take the tone
 * from STATUS_TONES (theme/status.ts), never from a colour of the page's
 * own. An icon, where one is given, goes before the words, never in
 * their place.
 */
export function StatusChip({
  tone,
  label,
  icon,
}: {
  tone: ToneName;
  label: string;
  icon?: ReactElement;
}) {
  return (
    <Chip size="small" label={label} color={COLOR_OF_TONE[tone]} icon={icon} />
  );
}
