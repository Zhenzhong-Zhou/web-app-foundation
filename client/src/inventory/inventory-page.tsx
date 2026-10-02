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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { formatDay, itemName } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { Availability, Location, StockRow } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { EditLotDialog } from './edit-lot-dialog';
import { type MoveMode, MoveStockDialog } from './move-stock-dialog';
import { MovementHistoryDialog } from './movement-history-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';
import { StockActions } from './stock-actions';

/** A page of the stock list (ADR-051). */
const PAGE_SIZE = 50;

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
  const can = useCan();

  const [locations, setLocations] = useState<Location[] | null>(null);
  const [locationId, setLocationId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [moving, setMoving] = useState<{
    mode: MoveMode;
    row: StockRow;
  } | null>(null);
  const [viewing, setViewing] = useState<StockRow | null>(null);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [editingLot, setEditingLot] = useState<StockRow | null>(null);

  /**
   * Per product across available locations: what is held for confirmed sales,
   * what is free to promise, and what is backordered (ADR-045). Not per row,
   * because a hold is not on a shelf — a sale has no location until it ships.
   *
   * Only products something is promised from (`promised=true`): the table
   * below shows nothing else, and the full list was every product in the
   * catalogue, 5,000 rows at ADR-051's large scale.
   */
  const [availability, setAvailability] = useState<Availability[] | null>(null);

  // Applied a moment after typing stops, so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  /**
   * A page at a time since ADR-051: the whole list was 520 ms at the large
   * scale. Filters go to the server, never applied in memory, which would
   * only ever narrow the page in hand and hide everything past it.
   */
  const stockPath = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (locationId) params.set('locationId', locationId);
    if (includeEmpty) params.set('includeEmpty', 'true');
    if (search) params.set('search', search);
    return `/stock?${params.toString()}`;
  }, [locationId, includeEmpty, search]);

  const {
    entries: rows,
    error: listError,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<StockRow>(stockPath);

  const error = listError ?? setupError;
  const showSkeleton = useDelayedFlag(loading);
  const leaves = locations ? leavesOf(locations) : [];

  const canAdjust = can('stock.adjust');

  const loadAvailability = useCallback(async () => {
    try {
      setAvailability(
        await api<Availability[]>('/stock/availability?promised=true'),
      );
    } catch (caught) {
      setSetupError(messageFor(caught));
    }
  }, []);

  /**
   * After anything that changes a row: the list from its first page, and
   * what is promised, because a sample taken or a lot moved into retention
   * changes what is free. A promise, because the dialogs wait on it.
   */
  const refresh = useCallback(async () => {
    reload();
    await loadAvailability();
  }, [reload, loadAvailability]);

  useEffect(() => {
    let ignore = false;

    void Promise.all([
      api<Location[]>('/locations'),
      api<Availability[]>('/stock/availability?promised=true'),
    ])
      .then(([all, promised]) => {
        if (ignore) return;
        setLocations(all);
        setAvailability(promised);
      })
      .catch((caught: unknown) => {
        if (!ignore) setSetupError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title="Inventory"
        actions={
          <Stack direction="row" spacing={1}>
            {/* A recall starts from a code off a label (ADR-044). */}
            <Button variant="text" component={RouterLink} to="/lots">
              Trace a lot
            </Button>

            <Button
              variant="text"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>

            {/* Hidden without stock.move — display only, since the 403 is the
            actual control (ADR-016). */}
            {can('stock.move') && (
              <Button
                disabled={!leaves.length}
                onClick={openDialog(() => setReceiving(true))}
              >
                Receive stock
              </Button>
            )}
          </Stack>
        }
      />

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
      <TextField
        id="stock-search"
        label="Search"
        fullWidth
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        helperText="Anywhere in the SKU, the product name or the lot code."
      />

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
          <TableContainer>
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
                  <TableRow key={row.id} hover>
                    <TableCell>{row.sku}</TableCell>
                    {/* The product, with the variant when it has a name of
                      its own — "Focus (60ct)" — as the packing slip and the
                      variant picker already say it. */}
                    <TableCell>
                      {itemName(row.productName, row.variantName)}
                    </TableCell>
                    <TableCell>{row.locationName}</TableCell>
                    <TableCell>
                      {row.lotCode ? (
                        <Chip label={row.lotCode} size="small" />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {row.lotExpiresAt ? formatDay(row.lotExpiresAt) : '—'}
                    </TableCell>
                    {/* Rendered as it arrived. Formatting it means parsing it,
                      and a numeric that passes through a JS double is the
                      precision loss ADR-025 exists to avoid. */}
                    <TableCell align="right">
                      {row.quantity} {row.unitOfMeasure}
                    </TableCell>

                    <TableCell padding="checkbox">
                      {can('stock.move') && (
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
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {search ? 'Nothing matches that search.' : 'Nothing here yet.'}
          </Typography>
        )}
      </Paper>

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />

      {/* Only products something is promised from. A product nobody has
          ordered is free in full, which the table above already says. A
          numeric(18, 4) of nothing always reads '0.0000', so this is a string
          check rather than parsing a quantity (ADR-025). */}
      {!!availability?.some(
        (row) => row.held !== '0.0000' || row.backordered !== '0.0000',
      ) && (
        <Stack spacing={1}>
          <Typography variant="h6" component="h2">
            Promised to customers
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Across every location stock can be sent from. Held stock is for a
            confirmed sale, earliest confirmed first; free stock can be
            promised, sampled or used in production.
          </Typography>

          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell align="right">On hand</TableCell>
                    <TableCell align="right">Held</TableCell>
                    <TableCell align="right">Free</TableCell>
                    <TableCell align="right">Backordered</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availability
                    .filter(
                      (row) =>
                        row.held !== '0.0000' || row.backordered !== '0.0000',
                    )
                    .map((row) => (
                      <TableRow key={row.variantId}>
                        <TableCell>{row.sku}</TableCell>
                        <TableCell align="right">
                          {row.onHand} {row.unitOfMeasure}
                        </TableCell>
                        <TableCell align="right">{row.held}</TableCell>
                        <TableCell align="right">{row.free}</TableCell>
                        <TableCell
                          align="right"
                          sx={
                            row.backordered !== '0.0000'
                              ? { color: 'warning.main' }
                              : undefined
                          }
                        >
                          {row.backordered}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}

      <ReceiveStockDialog
        open={receiving}
        locations={leaves}
        defaultLocationId={locationId}
        onClose={() => setReceiving(false)}
        onReceived={refresh}
      />

      {moving && (
        <MoveStockDialog
          mode={moving.mode}
          row={moving.row}
          locations={leaves}
          onClose={() => setMoving(null)}
          onMoved={refresh}
        />
      )}

      {viewing && (
        <MovementHistoryDialog row={viewing} onClose={() => setViewing(null)} />
      )}

      <EditLotDialog
        key={editingLot?.lotId ?? 'closed'}
        row={editingLot}
        onClose={() => setEditingLot(null)}
        onSaved={refresh}
      />
    </Stack>
  );
}
