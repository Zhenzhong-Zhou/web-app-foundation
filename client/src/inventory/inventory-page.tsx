import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import type { Location, StockRow } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { EditLotDialog } from './edit-lot-dialog';
import { type MoveMode, MoveStockDialog } from './move-stock-dialog';
import { MovementHistoryDialog } from './movement-history-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';
import { StockActions } from './stock-actions';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * Leaf-ness is computed rather than stored (ADR-024), so it is derived here the
 * same way the server derives it: a location nothing else claims as a parent.
 *
 * Duplicating the rule in two languages is a real cost. The alternative is a
 * flag the server maintains, which is a second source of truth for something
 * one query already answers — and the server still refuses a movement to a
 * branch, so a stale client can only offer a choice that then fails cleanly.
 */
function leavesOf(locations: Location[]): Location[] {
  const parents = new Set(
    locations.map((location) => location.parentId).filter(Boolean),
  );

  return locations.filter(
    (location) => location.isActive && !parents.has(location.id),
  );
}

/**
 * One screen for receiving stock and seeing what is where.
 *
 * Deliberately not a warehouse tree. A tree of empty locations proves the
 * locations module works and nothing else; this exercises products, locations,
 * and the movements ledger against each other, which is the only way to find
 * out whether the three actually fit together.
 */
export function InventoryPage() {
  const { session } = useAuth();

  const [locations, setLocations] = useState<Location[] | null>(null);
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [moving, setMoving] = useState<{
    mode: MoveMode;
    row: StockRow;
  } | null>(null);
  const [viewing, setViewing] = useState<StockRow | null>(null);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [editingLot, setEditingLot] = useState<StockRow | null>(null);

  const loading = rows === null && error === null;
  const showSkeleton = useDelayedFlag(loading);
  const leaves = locations ? leavesOf(locations) : [];

  const canAdjust = !!session?.permissions.includes('stock.adjust');

  /**
   * Both the callback and the effect need this, and URLSearchParams rather
   * than string concatenation now that there are two optional params — the
   * ?/& bookkeeping is where hand-built query strings go wrong.
   */
  const stockQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (locationId) params.set('locationId', locationId);
    if (includeEmpty) params.set('includeEmpty', 'true');
    return params.size ? `?${params.toString()}` : '';
  }, [locationId, includeEmpty]);

  const loadStock = useCallback(async () => {
    setRows(await api<StockRow[]>(`/stock${stockQuery}`));
    setError(null);
  }, [stockQuery]);

  useEffect(() => {
    let ignore = false;

    void api<Location[]>('/locations')
      .then((all) => {
        if (!ignore) setLocations(all);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Refetches when the filter changes rather than filtering in memory: the
  // list is scoped and indexed server-side, and a client filter would quietly
  // become wrong the moment pagination arrives.
  useEffect(() => {
    let ignore = false;

    void api<StockRow[]>(`/stock${stockQuery}`)
      .then((found) => {
        if (!ignore) setRows(found);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [stockQuery]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Inventory
        </Typography>

        <Button variant="text" onClick={() => void loadStock()}>
          Refresh
        </Button>

        {/* Hidden without stock.move — display only, since the 403 is the
            actual control (ADR-016). */}
        {session?.permissions.includes('stock.move') && (
          <Button disabled={!leaves.length} onClick={() => setReceiving(true)}>
            Receive stock
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {locations && !leaves.length && (
        <Alert severity="info">
          Add a location before receiving stock. Stock sits in the places that
          contain nothing else — a bin, a shelf, or a whole warehouse if you
          have not divided it up yet.
        </Alert>
      )}

      <TextField
        id="stock-location"
        label="Location"
        select
        fullWidth
        value={locationId}
        onChange={(event) => setLocationId(event.target.value)}
        helperText="Only locations that hold stock directly are listed."
      >
        <MenuItem value="">Everywhere</MenuItem>
        {leaves.map((location) => (
          <MenuItem key={location.id} value={location.id}>
            {location.code
              ? `${location.name} (${location.code})`
              : location.name}
          </MenuItem>
        ))}
      </TextField>

      {/* Zero rows are kept, never deleted — a shelf that emptied yesterday is
          a fact, and its movements are the only record of where the stock
          went. Hidden by default because "what is on this shelf" means what is
          there, but reachable, or that history has no route. */}
      <FormControlLabel
        control={
          <Switch
            checked={includeEmpty}
            onChange={(event) => setIncludeEmpty(event.target.checked)}
          />
        }
        label="Show emptied"
      />

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : rows?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Lot</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Quantity</TableCell>
                {/* The actions column. Headerless because a column of menu
                    buttons has no name worth reading out. */}
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.variantId}:${row.locationId}:${row.lotId ?? ''}`}
                  hover
                >
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.variantName ?? '—'}</TableCell>
                  <TableCell>{row.locationName}</TableCell>
                  <TableCell>
                    {row.lotCode ? (
                      <Chip label={row.lotCode} size="small" />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {row.lotExpiresAt
                      ? new Date(row.lotExpiresAt).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  {/* Rendered as it arrived. Formatting it means parsing it,
                      and a numeric that passes through a JS double is the
                      precision loss ADR-025 exists to avoid. */}
                  <TableCell align="right">
                    {row.quantity} {row.unitOfMeasure}
                  </TableCell>

                  <TableCell padding="checkbox">
                    {session?.permissions.includes('stock.move') && (
                      <StockActions
                        row={row}
                        canAdjust={canAdjust}
                        onSelect={(mode, selected) =>
                          setMoving({ mode, row: selected })
                        }
                        onHistory={setViewing}
                        onEditLot={setEditingLot}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            Nothing here yet.
          </Typography>
        )}
      </Paper>

      <ReceiveStockDialog
        open={receiving}
        locations={leaves}
        defaultLocationId={locationId}
        onClose={() => setReceiving(false)}
        onReceived={loadStock}
      />

      {moving && (
        <MoveStockDialog
          mode={moving.mode}
          row={moving.row}
          locations={leaves}
          onClose={() => setMoving(null)}
          onMoved={loadStock}
        />
      )}

      {viewing && (
        <MovementHistoryDialog row={viewing} onClose={() => setViewing(null)} />
      )}

      <EditLotDialog
        key={editingLot?.lotId ?? 'closed'}
        row={editingLot}
        onClose={() => setEditingLot(null)}
        onSaved={loadStock}
      />
    </Stack>
  );
}
