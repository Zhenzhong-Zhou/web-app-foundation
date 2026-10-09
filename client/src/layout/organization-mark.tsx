import { Box, Typography } from '@mui/material';

import { useBranding } from '../auth/use-branding';

/** Most logos are made for white, so a dark ground gets a white plate. */
const PLATE = { bgcolor: '#FFFFFF', borderRadius: 1, px: 1, py: 0.5 };

/**
 * The organization's place in the corner (ADR-055, ADR-060): its logo when
 * it has one, at most 32 px tall, else its name. The logo sits on a white
 * plate in dark mode, and on the dark rail when `onRail`. Fills its
 * parent's width, so the caller sets how wide the corner may grow.
 */
export function OrganizationMark({
  name,
  onRail = false,
}: {
  name: string;
  onRail?: boolean;
}) {
  const branding = useBranding();

  if (!branding?.logoFileId) {
    return (
      <Typography
        variant={onRail ? 'subtitle1' : 'h6'}
        component="div"
        noWrap
        sx={onRail ? { color: 'rail.strong' } : undefined}
      >
        {name}
      </Typography>
    );
  }

  return (
    <Box
      sx={[
        { display: 'flex', alignItems: 'center', maxWidth: '100%' },
        onRail && branding.rail === 'dark' ? PLATE : {},
        (theme) => theme.applyStyles('dark', PLATE),
      ]}
    >
      <Box
        component="img"
        src={`/api/v1/files/${branding.logoFileId}`}
        alt={name}
        sx={{ display: 'block', maxHeight: 32, maxWidth: '100%' }}
      />
    </Box>
  );
}
