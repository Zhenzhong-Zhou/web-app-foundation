import LockOutlined from '@mui/icons-material/LockOutlined';
import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { StatusChip } from '../components/status-chip';
import { HIDDEN } from '../lib/hidden';
import { FIXED_OPACITY } from '../theme/tokens';

const WORDS = defineMessages({
  fixed: { id: 'home.customise.fixed', defaultMessage: 'Fixed, cannot move' },
});

/**
 * Each fixed part's name, before its lock's words, for a screen reader:
 * what it marks has left what one reads while Home is customised, so the
 * lock says which part stays (WCAG 1.3.1).
 */
const PARTS = defineMessages({
  greeting: { id: 'home.customise.part.greeting', defaultMessage: 'Greeting:' },
  welcome: { id: 'home.customise.part.welcome', defaultMessage: 'Welcome:' },
  start: {
    id: 'home.customise.part.start',
    defaultMessage: 'Getting started:',
  },
  late: { id: 'home.customise.part.late', defaultMessage: 'What is late:' },
});

/**
 * What may not move, while Home is customised (the design language,
 * Arranging your own screen): in view, faded, and not to be used meanwhile,
 * with a lock and words saying it stays, the part named for a screen
 * reader; without a part, no lock. Outside it, as it is.
 */
export function Fixed({
  on,
  part,
  children,
}: {
  on: boolean;
  part?: keyof typeof PARTS;
  children: ReactNode;
}) {
  const intl = useIntl();
  return (
    <Box>
      {on && part && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Box component="span" sx={HIDDEN}>
            {intl.formatMessage(PARTS[part])}
          </Box>
          <StatusChip
            tone="warning"
            label={intl.formatMessage(WORDS.fixed)}
            icon={<LockOutlined />}
          />
        </Box>
      )}
      <Box inert={on} sx={on ? { opacity: FIXED_OPACITY } : undefined}>
        {children}
      </Box>
    </Box>
  );
}
