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
  TableHead,
  TableRow,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { displayQuantity, formatDate, NO_VALUE } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ProductionRun, RunStatus } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { STATUS_TONES } from '../theme/status';
import { CreateRunDialog } from './create-run-dialog';
import { RUN_STATUSES, runStatusLabel } from './status';

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
  const { text, setText, search } = useListSearch();
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
  } = useKeysetList<ProductionRun>(withSearch(query(filter), search));
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

      {/* The one filter row (ADR-055): All and each status, as buttons. */}
      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: text,
          onChange: setText,
        }}
        quick={[
          {
            id: 'all',
            label: intl.formatMessage({
              id: 'invoices.filter.all',
              defaultMessage: 'All',
            }),
            pressed: filter === '',
            onToggle: () => setFilter(''),
          },
          ...RUN_STATUSES.map((status) => ({
            id: status,
            label: runStatusLabel(status),
            pressed: filter === status,
            onToggle: () => setFilter(status),
          })),
        ]}
      />

      {error && <Alert severity="error">{error}</Alert>}

      {loading && showSkeleton && <Skeleton height={160} />}

      {items?.length === 0 && (
        <Paper variant="outlined">
          <EmptyState>
            {search
              ? intl.formatMessage({
                  id: 'inventory.noMatch',
                  defaultMessage: 'Nothing matches that search.',
                })
              : intl.formatMessage({
                  id: 'production.empty',
                  defaultMessage:
                    'Nothing here. A run consumes components and produces a finished item — it needs a recipe first, which lives on the product.',
                })}
          </EmptyState>
        </Paper>
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
                      <StatusChip
                        tone={STATUS_TONES.run[run.status]}
                        label={runStatusLabel(run.status)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {displayQuantity(run.quantityPlanned)}
                    </TableCell>
                    {/* Produced is not a percentage of planned. A batch
                        yielding 980 against 1000 is finished, not 98% done
                        (ADR-032), so showing a bar would imply a shortfall
                        that is not one. */}
                    <TableCell align="right">
                      {displayQuantity(run.quantityProduced)}
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
