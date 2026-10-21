import { Box, Typography } from '@mui/material';

import { useBranding } from '../auth/use-branding';
import { initialsLang, organizationInitialsOf } from '../lib/person-initials';

/** Most logos are made for white, so a dark ground gets a white plate. */
const PLATE = { bgcolor: '#FFFFFF', borderRadius: 1, px: 1, py: 0.5 };

/**
 * The organization's place in the corner (ADR-055, ADR-060): its logo when
 * it has one, at most 32 px tall, else its name. The logo sits on a white
 * plate in dark mode, and on the dark rail when `onRail`. Fills its
 * parent's width, so the caller sets how wide the corner may grow.
 *
 * `initials`, where the name would be cut to a few letters: the
 * organization's initials in its place (ADR-079); a logo stays a logo. The
 * name follows them for a screen reader, so the link is named for the
 * organization and still by what it shows (WCAG 2.5.3).
 */
export function OrganizationMark({
  name,
  onRail = false,
  initials = false,
}: {
  name: string;
  onRail?: boolean;
  initials?: boolean;
}) {
  const branding = useBranding();

  if (!branding?.logoFileId && initials) {
    const short = organizationInitialsOf(name);
    return (
      <Typography variant="h6" component="div">
        <span lang={initialsLang(short)}>{short}</span>
        {/* Placed out of sight, it is a block of its own, which a name
            is read with a space before. */}
        <Box component="span" sx={{ position: 'absolute', left: -9999 }}>
          {name}
        </Box>
      </Typography>
    );
  }

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
