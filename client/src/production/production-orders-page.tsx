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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ProductionRun, ProductionRunPage, RunStatus } from '../lib/types';
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

export function ProductionOrdersPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<ProductionRun[] | null>(null);
  const [filter, setFilter] = useState<RunStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  /**
   * Bumped to refetch without changing the filter. After planning a run the
   * list must reload, and setFilter('') alone does nothing when the filter
   * is already '' — React skips an update to the same value, the effect never
   * reruns, and a list cleared to null stays on its skeleton forever.
   */
  const [reloads, setReloads] = useState(0);

  const canCreate = !!session?.permissions.includes('production.create');
  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  /**
   * `before` absent loads the first page and replaces; present appends.
   *
   * The cursor comes from the server, which fetches one row past the limit to
   * know whether more exists. Inferring it from a full page is wrong exactly
   * once — on a final page that happens to be full — and the symptom is a Load
   * more button that returns nothing.
   */
  const load = useCallback(
    async (nextFilter: RunStatus | '', before?: string) => {
      const params = new URLSearchParams();
      if (nextFilter) params.set('status', nextFilter);
      if (before) params.set('before', before);

      const page = await api<ProductionRunPage>(
        `/production-orders?${params.toString()}`,
      );

      setItems((current) =>
        before ? [...(current ?? []), ...page.entries] : page.entries,
      );
      setCursor(page.nextCursor);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    let ignore = false;

    const params = new URLSearchParams();
    if (filter) params.set('status', filter);

    void api<ProductionRunPage>(`/production-orders?${params.toString()}`)
      .then((page) => {
        if (ignore) return;
        setItems(page.entries);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [filter, reloads]);

  async function loadMore() {
    if (!cursor) return;

    setLoadingMore(true);
    try {
      await load(filter, cursor);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

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
          onChange={(event) => {
            setItems(null);
            setCursor(null);
            setFilter(event.target.value as RunStatus | '');
          }}
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
            <TableContainer>
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
                      <TableCell align="right">
                        {run.quantityProduced}
                      </TableCell>
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
            </TableContainer>
          </Paper>

          {cursor && (
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
          // Back to All so the new run, which is a draft, is certainly in
          // view. The current rows stay up while the refetch runs rather
          // than blanking to a skeleton.
          setCursor(null);
          setFilter('');
          setReloads((count) => count + 1);
        }}
      />
    </Stack>
  );
}
