import {
  Alert,
  Button,
  Chip,
  Link,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { formatDate, formatQuantity, NO_VALUE } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ProductionRun, RunStatus } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { CreateRunDialog } from './create-run-dialog';
import { RUN_STATUSES, runStatusLabel, STATUS_COLOUR } from './status';

/** The first page for a filter; '' is every status. */
function query(filter: RunStatus | ''): string {
  return filter
    ? `/production-orders?${new URLSearchParams({ status: filter }).toString()}`
    : '/production-orders';
}

export function ProductionOrdersPage() {
  const intl = useIntl();
  const can = useCan();

  const [filter, setFilter] = useState<RunStatus | ''>('');
  const [creating, setCreating] = useState(false);

  const canCreate = can('production.create');
  const {
    entries: items,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<ProductionRun>(query(filter));
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.production',
          defaultMessage: 'Production',
        })}
        actions={
          canCreate && (
            <Button onClick={openDialog(() => setCreating(true))}>
              {intl.formatMessage({
                id: 'production.plan',
                defaultMessage: 'Plan a run',
              })}
            </Button>
          )
        }
      />

      {/* Its own row, as on the orders and audit pages (see OrdersPage). */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          id="run-filter"
          label={intl.formatMessage({
            id: 'orders.filter.label',
            defaultMessage: 'Show',
          })}
          select
          size="small"
          value={filter}
          onChange={(event) => setFilter(event.target.value as RunStatus | '')}
          // '' is "All", and MUI renders an empty value as blank unless told
          // otherwise. The label shrinks so it does not sit over the text.
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">
            {intl.formatMessage({
              id: 'invoices.filter.all',
              defaultMessage: 'All',
            })}
          </MenuItem>
          {RUN_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {runStatusLabel(status)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && showSkeleton && <Skeleton height={160} />}

      {items?.length === 0 && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'production.empty',
            defaultMessage:
              'Nothing here. A run consumes components and produces a finished item — it needs a recipe first, which lives on the product.',
          })}
        </Alert>
      )}

      {!!items?.length && (
        <>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'production.status.draft',
                      defaultMessage: 'Planned',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'orders.reference',
                      defaultMessage: 'Reference',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'inventory.quantity',
                      defaultMessage: 'Quantity',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'production.produced',
                      defaultMessage: 'Produced',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'production.madeBy',
                      defaultMessage: 'Made by',
                    })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>

              <TableBody>
                {items.map((run) => (
                  <TableRow key={run.id} hover>
                    <TableCell>{formatDate(run.createdAt)}</TableCell>
                    <TableCell>{run.reference ?? NO_VALUE}</TableCell>
                    <TableCell>
                      <Chip
                        label={runStatusLabel(run.status)}
                        size="small"
                        color={STATUS_COLOUR[run.status]}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {formatQuantity(run.quantityPlanned)}
                    </TableCell>
                    {/* Produced is not a percentage of planned. A batch
                        yielding 980 against 1000 is finished, not 98% done
                        (ADR-032), so showing a bar would imply a shortfall
                        that is not one. */}
                    <TableCell align="right">
                      {formatQuantity(run.quantityProduced)}
                    </TableCell>
                    <TableCell>
                      {run.partnerId
                        ? intl.formatMessage({
                            id: 'production.contract',
                            defaultMessage: 'Contract manufacturer',
                          })
                        : intl.formatMessage({
                            id: 'production.inHouse',
                            defaultMessage: 'In house',
                          })}
                    </TableCell>
                    <TableCell align="right">
                      <Link
                        component={RouterLink}
                        to={`/production/${run.id}`}
                        variant="body2"
                      >
                        {intl.formatMessage({
                          id: 'production.open',
                          defaultMessage: 'Open',
                        })}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <LoadMoreButton
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </>
      )}

      <CreateRunDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          // Back to All so the new run, which is a draft, is certainly in
          // view. Already on All, the rows stay up while the first page is
          // read again; from another filter it is a new list, read afresh.
          setFilter('');
          reload();
        }}
      />
    </Stack>
  );
}
