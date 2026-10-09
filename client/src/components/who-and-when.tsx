import { Box, Stack, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import { formatMoment, formatWhen, relativeTime } from '../lib/format';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { PersonAvatar } from './person-avatar';

/** One line, cut with "…", whole on hover: long emails never break a row. */
const ONE_LINE = {
  display: 'block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * Who did something (ADR-063): their face, their name, and their email
 * beneath it on one line, cut short when long. A removed account says so.
 */
export function Who({
  userId,
  name,
  email,
  photoFileId,
  size = 28,
}: {
  userId: string | null;
  name: string | null | undefined;
  email: string | null;
  photoFileId?: string | null;
  size?: number;
}) {
  const intl = useIntl();
  const removed = intl.formatMessage({
    id: 'audit.removedAccount',
    defaultMessage: 'A removed account',
  });

  return (
    <Stack
      direction="row"
      spacing={1.25}
      sx={{ alignItems: 'center', minWidth: 0 }}
    >
      <PersonAvatar
        userId={userId}
        name={name ?? null}
        email={email}
        photoFileId={photoFileId}
        size={size}
      />
      <Box sx={{ minWidth: 0, maxWidth: EMAIL_MAX_WIDTH }}>
        <Typography
          variant="body2"
          title={name || email || removed}
          sx={ONE_LINE}
        >
          {name || email || removed}
        </Typography>
        {name && email && (
          <Typography
            variant="caption"
            color="text.secondary"
            title={email}
            sx={ONE_LINE}
          >
            {email}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/**
 * When it happened: the day and time to the minute, and how long ago
 * beneath it, the second on hover.
 */
export function When({ at }: { at: string }) {
  return (
    <Box title={formatMoment(at)}>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {formatWhen(at)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {relativeTime(at)}
      </Typography>
    </Box>
  );
}
