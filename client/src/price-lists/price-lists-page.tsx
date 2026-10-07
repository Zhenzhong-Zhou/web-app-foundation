import {
  Alert,
  Button,
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
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
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
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.menu.priceLists',
          defaultMessage: 'Price lists',
        })}
        subtitle={intl.formatMessage({
          id: 'priceLists.intro',
          defaultMessage:
            'A line added without a price takes one from its customer’s or supplier’s list, and keeps it. Changing a list never changes an order already written.',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            {can('price_lists.create') && (
              <Button onClick={openDialog(() => setCreating(true))}>
                {intl.formatMessage({
                  id: 'priceLists.new',
                  defaultMessage: 'New price list',
                })}
              </Button>
            )}
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {lists === null ? (
          showSkeleton ? (
            <Skeleton height={120} sx={{ m: 2 }} />
          ) : null
        ) : lists.length === 0 ? (
          <EmptyState>
            {intl.formatMessage({
              id: 'priceLists.empty',
              defaultMessage: 'No price lists yet.',
            })}
          </EmptyState>
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
                        <StatusChip
                          tone="neutral"
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
