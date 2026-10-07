import { Box, Link, Tooltip, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { isActive, NAV_GROUPS, type NavItem } from './navigation';

/** The rail open, then folded to its icons. */
export const RAIL_WIDTH = 232;
export const RAIL_FOLDED_WIDTH = 64;

/**
 * The navigation itself (ADR-055), drawn by the rail and by the drawer
 * alike, so the two cannot list different places.
 *
 * Each group is its own `nav` landmark, named, so a screen reader lists
 * Main, Records and Settings as places to jump to. A group the person has
 * no entry in is left out whole, heading and all.
 */
export function SideNav({
  folded = false,
  onNavigate,
}: {
  /** Icons only, each named in a tooltip and to assistive technology. */
  folded?: boolean;
  /** Called after a link is followed: the drawer closes itself with it. */
  onNavigate?: () => void;
}) {
  const intl = useIntl();
  const can = useCan();
  const { pathname } = useLocation();

  const visible = (item: NavItem) => !item.permission || can(item.permission);

  return (
    <>
      {NAV_GROUPS.map((group, index) => {
        const items = group.items.filter(visible);
        if (!items.length) return null;

        const name = intl.formatMessage(group.label);

        return (
          <Box
            key={group.label.id}
            component="nav"
            aria-label={name}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}
          >
            {/* The first group is the work itself and needs no heading;
                folded, a line stands in for each heading. */}
            {index > 0 &&
              (folded ? (
                <Box sx={{ height: '1px', bgcolor: 'rail.divider', my: 1 }} />
              ) : (
                <Typography
                  variant="caption"
                  sx={{ color: 'rail.muted', fontWeight: 600, px: 1.5, pt: 2 }}
                >
                  {name}
                </Typography>
              ))}

            {items.map((item) => (
              <RailLink
                key={item.to}
                item={item}
                active={isActive(pathname, item.to)}
                folded={folded}
                onNavigate={onNavigate}
              />
            ))}
          </Box>
        );
      })}
    </>
  );
}

function RailLink({
  item,
  active,
  folded,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  folded: boolean;
  onNavigate?: () => void;
}) {
  const intl = useIntl();
  const label = intl.formatMessage(item.label);
  const Icon = item.icon;

  const link = (
    <Link
      component={RouterLink}
      to={item.to}
      underline="none"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      // Folded, the label is not drawn, so the link still has to say it.
      aria-label={folded ? label : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: folded ? 'center' : 'flex-start',
        gap: 1.25,
        minHeight: 36,
        px: 1.25,
        borderRadius: 1,
        typography: 'body1',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: active ? 'rail.strong' : 'rail.text',
        bgcolor: active ? 'rail.active' : 'transparent',
        '&:hover': { color: 'rail.strong', bgcolor: 'rail.hover' },
        '&:focus-visible': {
          outline: '2px solid currentColor',
          outlineOffset: -2,
        },
        '@media (pointer: coarse)': { minHeight: 44 },
      }}
    >
      <Icon fontSize="small" />
      {!folded && (
        <Box
          component="span"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </Box>
      )}
    </Link>
  );

  return folded ? (
    <Tooltip title={label} placement="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
