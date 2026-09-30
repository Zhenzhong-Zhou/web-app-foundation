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
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ProductionRun, RunStatus } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { CreateRunDialog } from './create-run-dialog';
import { STATUS_COLOUR, STATUS_LABEL } from './status';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Planned' },
  { value: 'released', label: 'In progress' },
  { value: 'completed', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

/** The first page for a filter; '' is every status. */
function query(filter: RunStatus | ''): string {
  return filter
    ? `/production-orders?${new URLSearchParams({ status: filter }).toString()}`
    : '/production-orders';
}

export function ProductionOrdersPage() {
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
        title="Production"
        actions={
          canCreate && (
            <Button onClick={openDialog(() => setCreating(true))}>
              Plan a run
            </Button>
          )
        }
      />

      {/* Its own row, as on the orders and audit pages (see OrdersPage). */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          id="run-filter"
          label="Show"
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
          {FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && showSkeleton && <Skeleton height={160} />}

      {items?.length === 0 && (
        <Alert severity="info">
          Nothing here. A run consumes components and produces a finished item —
          it needs a recipe first, which lives on the product.
        </Alert>
      )}

      {!!items?.length && (
        <>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Planned</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Produced</TableCell>
                  <TableCell>Made by</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>

              <TableBody>
                {items.map((run) => (
                  <TableRow key={run.id} hover>
                    <TableCell>{formatDate(run.createdAt)}</TableCell>
                    <TableCell>{run.reference ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABEL[run.status]}
                        size="small"
                        color={STATUS_COLOUR[run.status]}
                      />
                    </TableCell>
                    <TableCell align="right">{run.quantityPlanned}</TableCell>
                    {/* Produced is not a percentage of planned. A batch
                        yielding 980 against 1000 is finished, not 98% done
                        (ADR-032), so showing a bar would imply a shortfall
                        that is not one. */}
                    <TableCell align="right">{run.quantityProduced}</TableCell>
                    <TableCell>
                      {run.partnerId ? 'Contract manufacturer' : 'In house'}
                    </TableCell>
                    <TableCell align="right">
                      <Link
                        component={RouterLink}
                        to={`/production/${run.id}`}
                        variant="body2"
                      >
                        Open
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
