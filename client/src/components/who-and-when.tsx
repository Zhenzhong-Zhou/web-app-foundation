import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import { formatMoment, formatWhen, relativeTime } from '../lib/format';
import { EMAIL_MAX_WIDTH, EMAIL_MIN_WIDTH } from '../lib/text-limits';
import { PersonAvatar } from './person-avatar';

/** One line, cut with "…". */
const ONE_LINE = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * A name with the email beneath it, never wider than the name (ADR-063):
 * the email takes no width of its own, so the name sets it, between a
 * floor that leaves a short name's email readable and a ceiling. Whole on
 * hover, as a tooltip.
 */
export function NameAndEmail({
  name,
  email,
  nameVariant = 'body2',
}: {
  name: string;
  email: string | null;
  nameVariant?: 'body2' | 'subtitle2';
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        minWidth: EMAIL_MIN_WIDTH,
        maxWidth: EMAIL_MAX_WIDTH,
      }}
    >
      <Tooltip title={name} placement="top-start" enterDelay={600}>
        <Typography variant={nameVariant} sx={ONE_LINE}>
          {name}
        </Typography>
      </Tooltip>
      {email && (
        <Tooltip title={email} placement="bottom-start">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ...ONE_LINE, width: 0, minWidth: '100%' }}
          >
            {email}
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * Who did something (ADR-063): their face, their name, and their email
 * beneath it. A removed account says so.
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
      <NameAndEmail
        name={name || email || removed}
        email={name ? email : null}
      />
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
