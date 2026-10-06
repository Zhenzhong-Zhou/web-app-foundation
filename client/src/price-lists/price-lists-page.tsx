import {
  Alert,
  Button,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { openDialog } from '../lib/open-dialog';
import type { PriceList } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { CreatePriceListDialog } from './create-price-list-dialog';
import { sideLabel } from './sides';

/**
 * Every price list (ADR-049). A list proposes the price a line takes when it
 * is added without one; the line keeps its own copy, so nothing here changes
 * an order already written.
 */
export function PriceListsPage() {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();
  const { data, error, loading } = useResource<{ priceLists: PriceList[] }>(
    '/price-lists',
  );
  const lists = data?.priceLists ?? null;
  const [creating, setCreating] = useState(false);

  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'layout.menu.priceLists',
            defaultMessage: 'Price lists',
          })}
        </Typography>
        {can('price_lists.create') && (
          <Button onClick={openDialog(() => setCreating(true))}>
            {intl.formatMessage({
              id: 'priceLists.new',
              defaultMessage: 'New price list',
            })}
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'priceLists.intro',
          defaultMessage:
            'A line added without a price takes one from its customer’s or supplier’s list, and keeps it. Changing a list never changes an order already written.',
        })}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {lists === null ? (
          showSkeleton ? (
            <Skeleton height={120} sx={{ m: 2 }} />
          ) : null
        ) : lists.length === 0 ? (
          <Alert severity="info">
            {intl.formatMessage({
              id: 'priceLists.empty',
              defaultMessage: 'No price lists yet.',
            })}
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.name',
                      defaultMessage: 'Name',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'priceLists.side',
                      defaultMessage: 'Side',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'components.currency.label',
                      defaultMessage: 'Currency',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'orders.items',
                      defaultMessage: 'Items',
                    })}
                  </TableCell>
                  <TableCell
                    aria-label={intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {lists.map((list) => (
                  <TableRow key={list.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/settings/price-lists/${list.id}`}
                      >
                        {list.name}
                      </Link>
                    </TableCell>
                    <TableCell>{sideLabel(list.direction)}</TableCell>
                    <TableCell>{list.currency}</TableCell>
                    <TableCell align="right">{list.itemCount}</TableCell>
                    <TableCell>
                      {!list.isActive && (
                        <Chip
                          size="small"
                          label={intl.formatMessage({
                            id: 'common.retired',
                            defaultMessage: 'Retired',
                          })}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <CreatePriceListDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/settings/price-lists/${id}`)}
      />
    </Stack>
  );
}
