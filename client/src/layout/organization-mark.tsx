import { Box, Typography } from '@mui/material';

import { useBranding } from '../auth/use-branding';
import { initialsLang, organizationInitialsOf } from '../lib/person-initials';
import { rem } from '../theme/rem';
import { LOGO_ON_PLATE, logoSrc, SQUARE_LOGO_ON_PLATE } from './logo';

/**
 * The organization's place in the corner (ADR-055, ADR-060): its logo when
 * it has one, at most 32 px tall, else its name, with its square logo
 * beside it when it has one (ADR-060, amended). A logo sits on a white
 * plate in dark mode, and on the dark rail when `onRail`. Fills its
 * parent's width, so the caller sets how wide the corner may grow.
 *
 * `initials`, where the name would be cut to a few letters: the square
 * logo alone, else the logo, else the organization's initials in its place
 * (ADR-079). The name follows the initials for a screen reader, so the
 * link is named for the organization and still by what it shows (WCAG
 * 2.5.3); a logo alone is named for it.
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
  // Most logos are made for white, so a dark ground gets a white plate.
  const darkRail = onRail && branding?.rail === 'dark';

  const squareLogo = (fileId: string, alt: string) => (
    <Box
      sx={[
        { display: 'flex', flex: 'none' },
        darkRail ? SQUARE_LOGO_ON_PLATE : {},
        (theme) => theme.applyStyles('dark', SQUARE_LOGO_ON_PLATE),
      ]}
    >
      <Box
        component="img"
        src={logoSrc(fileId, 'thumb')}
        alt={alt}
        // In rem, so it grows with the name beside it.
        sx={{ display: 'block', maxWidth: rem(32), maxHeight: rem(32) }}
      />
    </Box>
  );

  if (initials && branding?.squareLogoFileId) {
    return squareLogo(branding.squareLogoFileId, name);
  }

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {/* The name beside it says whose it is. */}
        {branding?.squareLogoFileId &&
          squareLogo(branding.squareLogoFileId, '')}
        <Typography
          variant={onRail ? 'subtitle1' : 'h6'}
          component="div"
          noWrap
          sx={onRail ? { color: 'rail.strong' } : undefined}
        >
          {name}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={[
        { display: 'flex', alignItems: 'center', maxWidth: '100%' },
        darkRail ? LOGO_ON_PLATE : {},
        (theme) => theme.applyStyles('dark', LOGO_ON_PLATE),
      ]}
    >
      <Box
        component="img"
        src={logoSrc(branding.logoFileId)}
        alt={name}
        sx={{ display: 'block', maxHeight: 32, maxWidth: '100%' }}
      />
    </Box>
  );
}
