import { Box, Tooltip, Typography } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';

import { useAppName } from '../lib/app-name';
import { useBrand } from '../theme/brand-store';
import { ProductMark } from './product-mark';

/**
 * The rail's foot (ADR-082): "Powered by", the mark and the product's
 * name, small, after the organization's own at the top. The mark is the
 * version for the rail's actual colour: the on-dark one wherever the rail
 * is dark, the light rail in Dark mode included, and the light one only on
 * the light rail in Light (decision 3). Folded, the mark alone, named for
 * screen readers and in a tooltip on hover and keyboard focus; a stop of
 * its own on the way through, since a tooltip is how its words are read.
 * The menu drawer ends the same way.
 */
export function PoweredBy({ folded = false }: { folded?: boolean }) {
  const intl = useIntl();
  const name = useAppName();
  const onDark = useBrand().rail === 'dark';

  if (folded) {
    const said = intl.formatMessage(
      { id: 'brand.poweredBy', defaultMessage: 'Powered by {name}' },
      { name },
    );
    return (
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'rail.divider',
          pt: 1.5,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Tooltip title={said} placement="right">
          <Box
            role="img"
            aria-label={said}
            tabIndex={0}
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'rail.strong',
                outlineOffset: 2,
              },
            }}
          >
            <ProductMark size={22} onDark={onDark} />
          </Box>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Typography
      variant="caption"
      component="p"
      sx={{
        borderTop: 1,
        borderColor: 'rail.divider',
        pt: 1.5,
        px: 1.5,
        color: 'rail.muted',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 0.75,
      }}
    >
      <FormattedMessage
        id="brand.poweredBy"
        defaultMessage="Powered by {name}"
        values={{
          name: (
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                color: 'rail.strong',
                fontWeight: 600,
              }}
            >
              <ProductMark size={16} onDark={onDark} />
              {name}
            </Box>
          ),
        }}
      />
    </Typography>
  );
}
