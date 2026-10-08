import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import UpdateOutlined from '@mui/icons-material/UpdateOutlined';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * The status page's kinds (conventions.md, "Status pages"): each an icon
 * and a tone, calm for what is merely not there, amber for what is not
 * yours, red only for a real failure.
 */
export type StatusKind =
  'notFound' | 'missing' | 'forbidden' | 'crash' | 'offline' | 'updated';

const LOOK: Record<
  StatusKind,
  { icon: typeof SearchOutlined; bg: string; fg: string }
> = {
  notFound: { icon: SearchOutlined, bg: 'info.light', fg: 'info.dark' },
  missing: { icon: DescriptionOutlined, bg: 'info.light', fg: 'info.dark' },
  forbidden: { icon: LockOutlined, bg: 'warning.light', fg: 'warning.dark' },
  crash: { icon: ReportProblemOutlined, bg: 'error.light', fg: 'error.dark' },
  offline: { icon: CloudOffOutlined, bg: 'action.hover', fg: 'text.secondary' },
  updated: { icon: UpdateOutlined, bg: 'info.light', fg: 'info.dark' },
};

/**
 * One shape for every "this page can't show you that": an icon, a short
 * title (the page's one heading), one sentence of what to do, one or two
 * actions, and a reference where a failure needs reporting. Shown where the
 * page would be, so the rail and the lookup stay usable around it; signed
 * out, `standalone` centres it on its own.
 */
export function StatusPage({
  kind,
  title,
  message,
  actions,
  reference,
  standalone = false,
}: {
  kind: StatusKind;
  title: string;
  message: string;
  actions: ReactNode;
  reference?: ReactNode;
  standalone?: boolean;
}) {
  const look = LOOK[kind];
  const Icon = look.icon;

  const body = (
    <Stack
      spacing={1.75}
      sx={{ alignItems: 'center', textAlign: 'center', maxWidth: 520 }}
    >
      <Box
        aria-hidden
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          bgcolor: look.bg,
          color: look.fg,
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
      <Typography color="text.secondary" sx={{ fontSize: 17 }}>
        {message}
      </Typography>
      <Stack
        direction="row"
        sx={{ gap: 1.25, flexWrap: 'wrap', justifyContent: 'center', pt: 0.5 }}
      >
        {actions}
      </Stack>
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
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, maxWidth: 480 }}>
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
