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
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import type { ProductionRun, RunStatus } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreateRunDialog } from './create-run-dialog';
import { STATUS_COLOUR, STATUS_LABEL } from './status';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Planned' },
  { value: 'released', label: 'In progress' },
  { value: 'completed', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const PAGE_SIZE = 50;

export function ProductionOrdersPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<ProductionRun[] | null>(null);
  const [filter, setFilter] = useState<RunStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);

  const canCreate = !!session?.permissions.includes('production.create');
  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  /**
   * The cursor is the last row's id rather than one the server hands back.
   * Rows come newest-first on a UUIDv7 id (ADR-018), so the oldest id on
   * screen is the next `before` — but unlike /orders this endpoint returns a
   * bare array, so there is no nextCursor and no way to know whether more
   * exists. A full page is the only signal, which is wrong exactly once, when
   * the last page happens to be full.
   */
  const load = useCallback(
    async (nextFilter: RunStatus | '', before?: string) => {
      const params = new URLSearchParams();
      if (nextFilter) params.set('status', nextFilter);
      if (before) params.set('before', before);

      const rows = await api<ProductionRun[]>(
        `/production-orders?${params.toString()}`,
      );

      setItems((current) => (before ? [...(current ?? []), ...rows] : rows));
      setError(null);

      return rows.length;
    },
    [],
  );

  useEffect(() => {
    let ignore = false;

    const params = new URLSearchParams();
    if (filter) params.set('status', filter);

    void api<ProductionRun[]>(`/production-orders?${params.toString()}`)
      .then((rows) => {
        if (ignore) return;
        setItems(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [filter]);

  async function loadMore() {
    if (!items?.length) return;

    setLoadingMore(true);
    try {
      await load(filter, items[items.length - 1].id);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Production
        </Typography>

        <TextField
          id="run-filter"
          label="Show"
          select
          size="small"
          value={filter}
          onChange={(event) => {
            setItems(null);
            setFilter(event.target.value as RunStatus | '');
          }}
          sx={{ minWidth: 160 }}
        >
          {FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {canCreate && (
          <Button onClick={() => setCreating(true)}>Plan a run</Button>
        )}
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

          {items.length % PAGE_SIZE === 0 && (
            <Button
              variant="text"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}

      <CreateRunDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setItems(null);
          setFilter('');
        }}
      />
    </Stack>
  );
}
