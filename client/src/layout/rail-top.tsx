import KeyboardDoubleArrowLeft from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRight from '@mui/icons-material/KeyboardDoubleArrowRight';
import {
  Box,
  ButtonBase,
  IconButton,
  Link,
  Stack,
  Tooltip,
} from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useBranding } from '../auth/use-branding';
import { initialsLang, organizationInitialsOf } from '../lib/person-initials';
import { rem } from '../theme/rem';
import { LIGHT, TYPE } from '../theme/tokens';
import { LOGO_PLATE } from './logo';
import { OrganizationMark } from './organization-mark';
import { RAIL_FOCUS_RING } from './rail';
import { usePlate } from './use-plate';

/**
 * The rail's top (ADR-082, amending ADR-060's layout): the organization's,
 * as the rail's foot is the product's. Open, its logo, on a white plate on
 * a dark rail as OrganizationMark draws it, or its name, a link to Home as
 * the top bar's was, with the fold button beside it. Folded, one 44 px plate that is the unfold button: the
 * square logo, or the logo when it is about square (usePlate), else the
 * organization's initials on its accent, in the colours a contained button
 * takes, so they pass in either mode. On hover or keyboard focus » takes
 * the plate's place, with a tooltip; a tap unfolds. Its words are the fold
 * button's own, Expand and Collapse navigation (Bob, 24 October 2026).
 */
export function RailTop({
  name,
  folded,
  onToggle,
}: {
  name: string;
  folded: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const branding = useBranding();
  const { face, measure } = usePlate(
    branding?.logoFileId ?? null,
    branding?.squareLogoFileId ?? null,
  );

  // A square logo shows at once. Without one, the logo's own width and
  // height, read when it loads, open or folded, so a fold draws it at once;
  // unknown until then, and the plate » alone. RailTop stays as the rail
  // folds, so the answer stays with it.
  const measuring = measure && <img hidden alt="" {...measure} />;

  if (!folded) {
    return (
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 0.75, minHeight: 44, mb: 0.5 }}
      >
        {/* The way home, as the top-left corner is (ADR-058), named by the
            logo or the name it shows, and that name in full on hover where
            the rail cuts it; the fold button beside it, not in it. */}
        <Link
          component={RouterLink}
          to="/"
          underline="none"
          color="inherit"
          title={name}
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            pl: 0.5,
            borderRadius: 1,
            '&:focus-visible': RAIL_FOCUS_RING,
          }}
        >
          <OrganizationMark name={name} onRail />
        </Link>
        <IconButton
          aria-label={intl.formatMessage({
            id: 'layout.collapseNavigation',
            defaultMessage: 'Collapse navigation',
          })}
          aria-expanded
          onClick={onToggle}
          sx={{
            flex: 'none',
            color: 'rail.text',
            '&:hover': { color: 'rail.strong', bgcolor: 'rail.hover' },
          }}
        >
          <KeyboardDoubleArrowLeft fontSize="small" />
        </IconButton>
        {measuring}
      </Stack>
    );
  }

  const initials = organizationInitialsOf(name);
  // Its initials, where it shows them: none while the logo is read.
  const shown = face.kind === 'initials' ? initials : null;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
      <Tooltip
        title={intl.formatMessage({
          id: 'layout.expandNavigation',
          defaultMessage: 'Expand navigation',
        })}
        placement="right"
      >
        <ButtonBase
          // Its initials first where it shows them, so a voice user can say
          // what they see, as the account button does (WCAG 2.5.3).
          aria-label={
            !shown
              ? intl.formatMessage(
                  {
                    id: 'layout.expandNavigationOf',
                    defaultMessage: 'Expand navigation ({organization})',
                  },
                  { organization: name },
                )
              : intl.formatMessage(
                  {
                    id: 'layout.expandNavigationWithInitials',
                    defaultMessage:
                      '{initials}, Expand navigation ({organization})',
                  },
                  { initials, organization: name },
                )
          }
          aria-expanded={false}
          onClick={onToggle}
          sx={[
            {
              // In rem, as a box with words in it is, so the initials still
              // fit it at Larger text (ADR-075); 44 px at Standard.
              width: rem(44),
              height: rem(44),
              flex: 'none',
              borderRadius: 1,
              // A button takes the browser's own font, not the app's.
              font: 'inherit',
              '& .unfold': { display: 'none' },
              '&:hover, &.Mui-focusVisible': {
                '& .face': { display: 'none' },
                '& .unfold': { display: 'block' },
              },
              '&.Mui-focusVisible': RAIL_FOCUS_RING,
            },
            !shown
              ? {
                  // White in both modes, as the logo's plate is, and while
                  // the logo is read; the arrow takes Light's text on it.
                  // Its edge shows on a white rail.
                  bgcolor: LOGO_PLATE,
                  color: LIGHT.text,
                  border: 1,
                  borderColor: 'rail.divider',
                }
              : {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  fontWeight: 700,
                  fontSize: rem(TYPE.section),
                },
          ]}
        >
          {'src' in face && (
            <Box
              component="img"
              className="face"
              src={face.src}
              alt=""
              // In rem, as the plate is, so it grows with the plate at Large
              // and Larger text; 28 px at Standard (ADR-060, amended).
              sx={{ maxWidth: rem(28), maxHeight: rem(28) }}
            />
          )}
          {shown && (
            <span className="face" aria-hidden lang={initialsLang(shown)}>
              {shown}
            </span>
          )}
          <KeyboardDoubleArrowRight
            className={face.kind === 'measuring' ? undefined : 'unfold'}
            fontSize="small"
          />
        </ButtonBase>
      </Tooltip>
      {measuring}
    </Box>
  );
}
