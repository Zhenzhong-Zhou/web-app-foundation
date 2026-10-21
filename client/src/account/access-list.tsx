import { Box, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Permission } from '../api/types.gen';
import { rem } from '../theme/rem';
import { accessAreas } from './access-phrases';

/**
 * Your access's sentences (ADR-079) for any permissions: an area's name
 * beside what may be done in it, the area under it on a phone. Your access
 * and the welcome show the reader's own; a role's page, the role editor
 * and Change roles show a role's, or several roles' together (ADR-080), so
 * each says it as its holder will read it. `stacked` puts each area over
 * its sentence at every width, for a narrow panel.
 */
export function AccessList({
  permissions,
  stacked = false,
}: {
  permissions: readonly Permission[];
  stacked?: boolean;
}) {
  const intl = useIntl();

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
            {label}
          </Typography>
          <Typography component="span" color="text.secondary">
            {sentence}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
