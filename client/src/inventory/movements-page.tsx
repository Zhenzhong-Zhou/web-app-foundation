import {
  Alert,
  Autocomplete,
  Chip,
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
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { api } from '../lib/api';
import { itemName, relativeTime } from '../lib/format';
import type { Location, Movement, VariantOption } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { leavesOf } from '../locations/tree';
import { describeMovement } from './describe-movement';

const PAGE_SIZE = 25;

/** Matches MOVEMENT_REASONS. Kept as a list so the filter cannot drift from it. */
const REASONS = [
  'receipt',
  'shipment',
  'transfer',
  'adjustment',
  'production',
  'consumption',
  'sample',
  'return',
] as const;

/**
 * Everything that has moved, newest first.
 *
 * The per-row dialog answers "why does this shelf say 47". This answers "what
 * happened today", which is the question at a shift handover and the one the
 * ledger could not be asked until now.
 *
 * Gated on stock.view and nothing narrower, deliberately. Every row here is
 * already reachable through the history dialog one variant at a time — this is
 * the same access with fewer clicks, not wider access, and a check invented to
 * "tighten" it would be restricting the audit trail from the people who read
 * it.
 */
export function MovementsPage() {
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [variant, setVariant] = useState<VariantOption | null>(null);
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');

  /**
   * No filter set means recent-everything, rather than an empty screen asking
   * for one. The first page is 25 rows off an indexed scan either way, and
   * "what happened lately" is the more common reason to open this.
   */
  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (variant) params.set('variantId', variant.id);
    if (locationId) params.set('locationId', locationId);
    if (reason) params.set('reason', reason);
    return params.toString();
  }, [variant, locationId, reason]);

  /**
   * Refetched when a filter changes rather than filtered in memory. The list
   * is paged, so an in-memory filter would only ever narrow the page in hand
   * and quietly hide everything past it.
   */
  const { entries, error, loading, hasMore, loadingMore, loadMore } =
    useKeysetList<Movement>(`/stock/movements?${query}`);
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    void Promise.all([
      api<VariantOption[]>('/products/variants'),
      api<Location[]>('/locations'),
    ])
      .then(([variantRows, locationRows]) => {
        if (ignore) return;
        setVariants(variantRows);
        setLocations(locationRows);
      })
      // Silent: the filters degrade to empty pickers, and the table below is
      // the point of the page.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  // Stock sits only at leaves (ADR-024), so nothing else can appear in a row.
  const leaves = leavesOf(locations);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title="Movements"
        subtitle="Every quantity change, newest first. Movements are never edited or removed — a mistake is corrected by another movement."
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Autocomplete
          sx={{ flexGrow: 1 }}
          options={variants}
          getOptionLabel={(option) =>
            `${option.sku} — ${itemName(option.productName, option.variantName)}`
          }
          value={variant}
          onChange={(_event, value) => setVariant(value)}
          renderInput={(params) => <TextField {...params} label="Item" />}
        />

        <TextField
          select
          label="Location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Everywhere</MenuItem>
          {leaves.map((location) => (
            <MenuItem key={location.id} value={location.id}>
              {location.name}
            </MenuItem>
          ))}
        </TextField>

        {/* Matches on either end of a transfer, since a movement between two
            shelves is as much a fact about the source as the destination. */}
        <TextField
          select
          label="Why"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Any reason</MenuItem>
          {REASONS.map((value) => (
            <MenuItem
              key={value}
              value={value}
              sx={{ textTransform: 'capitalize' }}
            >
              {value}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </>
            ) : null}
          </Stack>
        ) : entries?.length ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Change</TableCell>
                  <TableCell>Where</TableCell>
                  <TableCell>Why</TableCell>
                  <TableCell>By</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {entries.map((movement) => {
                  const { sign, where } = describeMovement(movement);

                  return (
                    <TableRow key={movement.id} hover>
                      <TableCell>
                        <span
                          title={new Date(movement.createdAt).toLocaleString()}
                        >
                          {relativeTime(movement.createdAt)}
                        </span>
                      </TableCell>

                      {/* Snapshotted on the row (ADR-023), so a rename does not
                        rewrite what this movement said at the time. */}
                      <TableCell>
                        {movement.sku}
                        {movement.lotCode && (
                          <Chip
                            label={movement.lotCode}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </TableCell>

                      {/* Rendered as it arrived. Formatting means parsing, and a
                        numeric through a JS double is the precision loss
                        ADR-025 exists to avoid. */}
                      <TableCell align="right">
                        {sign}
                        {movement.quantity}
                      </TableCell>

                      <TableCell>{where}</TableCell>

                      <TableCell>
                        <Chip label={movement.reason} size="small" />
                        {movement.reasonDetail && ` ${movement.reasonDetail}`}
                        {/* Required on an adjustment, because a person asserting
                          the system is wrong has to say what they found
                          (ADR-023). This is where it gets read. */}
                        {movement.note && (
                          <Typography
                            variant="caption"
                            component="div"
                            color="text.secondary"
                          >
                            {movement.note}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Null when the actor was anonymised (ADR-012). The row
                        survives its author, which is what RESTRICT on actor_id
                        is for. */}
                      <TableCell>
                        {movement.actorEmail ?? 'Deleted user'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {variant || locationId || reason
              ? 'Nothing matches those filters.'
              : 'Nothing has moved yet. Receiving stock is what puts the first row here.'}
          </Typography>
        )}
      </Paper>

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </Stack>
  );
}
