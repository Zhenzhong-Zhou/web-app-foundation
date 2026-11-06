import { Box, Link, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { Permission } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { NAV_GROUPS } from '../layout/navigation';
import { OFFER_BACK } from '../lib/offer-back';
import { rem } from '../theme/rem';
import { accessAreas, type Area } from './access-phrases';

/**
 * The menu's pages each area opens, the first the reader may open taking
 * the link (ADR-091's review): its name, its address and what opening it
 * takes come from the menu itself, so a row says the name the reader will
 * find there, Inventory for stock, Tax codes where costs are closed.
 */
const AREA_PATHS: Record<Area, readonly string[]> = {
  stock: ['/inventory', '/locations'],
  products: ['/products', '/licences'],
  orders: ['/orders'],
  production: ['/production'],
  invoices: ['/invoices', '/return-authorizations'],
  costs: ['/costs', '/settings/tax-codes', '/settings/price-lists'],
  partners: ['/partners'],
  people: ['/people', '/settings/organization'],
};

const NAV_ITEMS = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.to, item]),
);

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
  const pageOf = (area: Area) =>
    AREA_PATHS[area]
      .map((path) => NAV_ITEMS.get(path))
      .find((item) => item && (!item.permission || can(item.permission)));

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
            {linked && pageOf(area) ? (
              <Link
                component={RouterLink}
                to={pageOf(area)!.to}
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
                {intl.formatMessage(pageOf(area)!.label)}
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
