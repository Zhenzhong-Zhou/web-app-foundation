import { Box, Link, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { Permission } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { OFFER_BACK } from '../lib/offer-back';
import { rem } from '../theme/rem';
import { accessAreas, type Area } from './access-phrases';

/** Each area's page, and what opening it takes (ADR-091). */
const AREA_PAGES: Record<Area, { to: string; permission: Permission }> = {
  stock: { to: '/inventory', permission: 'stock.view' },
  products: { to: '/products', permission: 'products.view' },
  orders: { to: '/orders', permission: 'orders.view' },
  production: { to: '/production', permission: 'production.view' },
  invoices: { to: '/invoices', permission: 'invoices.view' },
  costs: { to: '/costs', permission: 'costs.view' },
  partners: { to: '/partners', permission: 'partners.view' },
  people: { to: '/people', permission: 'users.view' },
};

/**
 * Your access's sentences (ADR-079) for any permissions: an area's name
 * beside what may be done in it, the area under it on a phone. Your access
 * and the welcome show the reader's own; a role's page, the role editor
 * and Change roles show a role's, or several roles' together (ADR-080), so
 * each says it as its holder will read it. `stacked` puts each area over
 * its sentence at every width, for a narrow panel. `linked`, for the
 * reader's own: each area's name a link to its page, where they may open
 * it.
 */
export function AccessList({
  permissions,
  stacked = false,
  linked = false,
}: {
  permissions: readonly Permission[];
  stacked?: boolean;
  linked?: boolean;
}) {
  const intl = useIntl();
  const can = useCan();

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {accessAreas(intl, permissions).map(({ area, label, sentence }) => (
        <Box
          component="li"
          key={area}
          sx={{
            display: 'grid',
            gridTemplateColumns: stacked
              ? 'minmax(0, 1fr)'
              : { xs: 'minmax(0, 1fr)', sm: `${rem(176)} minmax(0, 1fr)` },
            gap: stacked ? 0.25 : { xs: 0.25, sm: 1.5 },
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {linked && can(AREA_PAGES[area].permission) ? (
              <Link
                component={RouterLink}
                to={AREA_PAGES[area].to}
                state={OFFER_BACK}
                underline="always"
                // A target of 44 px on touch (ADR-091).
                sx={{
                  '@media (pointer: coarse)': {
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 44,
                  },
                }}
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </Typography>
          <Typography component="span" sx={{ color: 'text.secondary' }}>
            {sentence}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
