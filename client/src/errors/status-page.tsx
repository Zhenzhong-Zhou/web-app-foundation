import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import UpdateOutlined from '@mui/icons-material/UpdateOutlined';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { rem } from '../theme/rem';
import { type ToneName, TYPE } from '../theme/tokens';

/**
 * The status page's kinds (conventions.md, "Status pages"): each an icon
 * and a tone, calm for what is merely not there, amber for what is not
 * yours, red only for a real failure. The icon is the tone's text on its
 * tint (ADR-055), whose pairs pass in both modes; MUI's derived light and
 * dark put it at 2.2 : 1 (ADR-081).
 */
export type StatusKind =
  | 'notFound'
  | 'missing'
  | 'forbidden'
  | 'crash'
  | 'offline'
  | 'updated'
  | 'installing';

const LOOK: Record<
  StatusKind,
  { icon: typeof SearchOutlined; tone: ToneName }
> = {
  notFound: { icon: SearchOutlined, tone: 'info' },
  missing: { icon: DescriptionOutlined, tone: 'info' },
  forbidden: { icon: LockOutlined, tone: 'warning' },
  crash: { icon: ReportProblemOutlined, tone: 'critical' },
  offline: { icon: CloudOffOutlined, tone: 'neutral' },
  updated: { icon: UpdateOutlined, tone: 'info' },
  installing: { icon: ScheduleOutlined, tone: 'info' },
};

/**
 * One shape for every "this page can't show you that": an icon, a short
 * title (the page's one heading), one sentence of what to do, a smaller
 * line where the page does something by itself, one or two actions unless
 * the page does it all itself, and a reference where a failure needs
 * reporting. Shown where the page would be, so the rail and the lookup
 * stay usable around it; signed out, `standalone` centres it on its own.
 */
export function StatusPage({
  kind,
  title,
  message,
  note,
  actions,
  reference,
  standalone = false,
}: {
  kind: StatusKind;
  title: string;
  message: string;
  note?: string;
  actions?: ReactNode;
  reference?: ReactNode;
  standalone?: boolean;
}) {
  const look = LOOK[kind];
  const Icon = look.icon;

  const body = (
    <Stack
      spacing={1.75}
      sx={{ alignItems: 'center', textAlign: 'center', maxWidth: rem(520) }}
    >
      <Box
        aria-hidden
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          bgcolor: `tone.${look.tone}.bg`,
          color: `tone.${look.tone}.fg`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon fontSize="large" />
      </Box>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: rem(TYPE.section) }}>
        {message}
      </Typography>
      {note && (
        // In sx: Typography's color takes a palette name, not a path, and
        // drew text.secondary as the plain text colour (#196).
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {note}
        </Typography>
      )}
      {actions && (
        <Stack
          direction="row"
          sx={{
            gap: 1.25,
            flexWrap: 'wrap',
            justifyContent: 'center',
            pt: 0.5,
          }}
        >
          {actions}
        </Stack>
      )}
      {reference}
    </Stack>
  );

  if (standalone) {
    return (
      <Box
        component="main"
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, sm: 5 }, maxWidth: rem(480) }}
        >
          {body}
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        py: 6,
      }}
    >
      {body}
    </Box>
  );
}
