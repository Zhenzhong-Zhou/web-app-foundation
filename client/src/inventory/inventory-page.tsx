import {
  Alert,
  Button,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExpiryChip } from '../components/expiry-chip';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { EXPIRY_DAYS } from '../lib/expiry';
import {
  displayQuantity,
  itemName,
  nameAndCode,
  NO_VALUE,
} from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { Availability, Location, StockRow } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { displayWithUnit } from '../products/units';
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
  const intl = useIntl();
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
  // "Expiring soon": lots within the amber threshold, the expired included.
  const [expiring, setExpiring] = useState(false);
  const [expiringCount, setExpiringCount] = useState<number | null>(null);
  /** Bumped by Refresh and by every dialog that moves stock. */
  const [changes, setChanges] = useState(0);
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
    if (expiring) params.set('expiringWithin', String(EXPIRY_DAYS.warning));
    return `/stock?${params.toString()}`;
  }, [locationId, includeEmpty, search, expiring]);

  /**
   * The count beside "Expiring soon", with the list's other filters, so it
   * is the number of rows pressing it shows (GET /stock/counts).
   */
  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams({
      expiringWithin: String(EXPIRY_DAYS.warning),
    });
    if (locationId) params.set('locationId', locationId);
    if (includeEmpty) params.set('includeEmpty', 'true');
    if (search) params.set('search', search);

    void api<{ expiring: number }>(`/stock/counts?${params.toString()}`)
      .then((counts) => {
        if (!ignore) setExpiringCount(counts.expiring);
      })
      // Silent: without a count the button still works.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [locationId, includeEmpty, search, changes]);

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
    setChanges((count) => count + 1);
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
        title={intl.formatMessage({
          id: 'layout.nav.inventory',
          defaultMessage: 'Inventory',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            {/* A recall starts from a code off a label (ADR-044). */}
            <Button variant="text" component={RouterLink} to="/lots">
              {intl.formatMessage({
                id: 'inventory.trace.title',
                defaultMessage: 'Trace a lot',
              })}
            </Button>

            <Button
              variant="text"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {intl.formatMessage({
                id: 'common.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>

            {/* Hidden without stock.move — display only, since the 403 is the
            actual control (ADR-016). */}
            {can('stock.move') && (
              <Button
                disabled={!leaves.length}
                onClick={openDialog(() => setReceiving(true))}
              >
                {intl.formatMessage({
                  id: 'inventory.receive',
                  defaultMessage: 'Receive stock',
                })}
              </Button>
            )}
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {locations && !leaves.length && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'inventory.needsLocation',
            defaultMessage:
              'Add a location before receiving stock. Stock sits in the places that contain nothing else — a bin, a shelf, or a whole warehouse if you have not divided it up yet.',
          })}
        </Alert>
      )}

      {/* The one filter row (ADR-055). Search reaches the SKU, the product
          name and the lot code; Location lists only places that hold stock
          directly. "Show emptied" reaches zero rows, which are kept, never
          deleted: a shelf that emptied yesterday is a fact, and its
          movements are the only record of where the stock went. */}
      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: searchText,
          onChange: setSearchText,
        }}
        quick={[
          {
            id: 'expiring',
            label: intl.formatMessage({
              id: 'inventory.quick.expiring',
              defaultMessage: 'Expiring soon',
            }),
            count: expiringCount ?? undefined,
            pressed: expiring,
            onToggle: () => setExpiring((on) => !on),
          },
          {
            id: 'emptied',
            label: intl.formatMessage({
              id: 'inventory.showEmptied',
              defaultMessage: 'Show emptied',
            }),
            pressed: includeEmpty,
            onToggle: () => setIncludeEmpty((on) => !on),
          },
        ]}
      >
        <TextField
          id="stock-location"
          size="small"
          label={intl.formatMessage({
            id: 'inventory.location',
            defaultMessage: 'Location',
          })}
          select
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">
            {intl.formatMessage({
              id: 'inventory.everywhere',
              defaultMessage: 'Everywhere',
            })}
          </MenuItem>
          {leaves.map((location) => (
            <MenuItem key={location.id} value={location.id}>
              {nameAndCode(location.name, location.code)}
            </MenuItem>
          ))}
        </TextField>
      </FilterRow>

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
                  <TableCell>
                    {intl.formatMessage({
                      id: 'products.sku',
                      defaultMessage: 'SKU',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.item',
                      defaultMessage: 'Item',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.location',
                      defaultMessage: 'Location',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.lot',
                      defaultMessage: 'Lot',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.lot.expires',
                      defaultMessage: 'Expires',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'inventory.quantity',
                      defaultMessage: 'Quantity',
                    })}
                  </TableCell>
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
                        NO_VALUE
                      )}
                    </TableCell>
                    {/* Days left within 90 days, red within 30, the date
                        beside it (ADR-055). */}
                    <TableCell>
                      <ExpiryChip expiresAt={row.lotExpiresAt} />
                    </TableCell>
                    {/* Read without padding zeros, grouped the language's way
                      (displayQuantity), but never parsed: a numeric through
                      a JS double is the loss ADR-025 exists to avoid. */}
                    <TableCell align="right">
                      {displayWithUnit(row.quantity, row.unitOfMeasure, intl)}
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
          <EmptyState>
            {expiring
              ? intl.formatMessage(
                  {
                    id: 'inventory.noneExpiring',
                    defaultMessage: 'No lot here expires within {days} days.',
                  },
                  { days: EXPIRY_DAYS.warning },
                )
              : search
                ? intl.formatMessage({
                    id: 'inventory.noMatch',
                    defaultMessage: 'Nothing matches that search.',
                  })
                : intl.formatMessage({
                    id: 'inventory.empty',
                    defaultMessage: 'Nothing here yet.',
                  })}
          </EmptyState>
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
            {intl.formatMessage({
              id: 'inventory.promised.title',
              defaultMessage: 'Promised to customers',
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({
              id: 'inventory.promised.intro',
              defaultMessage:
                'Across every location stock can be sent from. Held stock is for a confirmed sale, earliest confirmed first; free stock can be promised, sampled or used in production.',
            })}
          </Typography>

          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'products.sku',
                        defaultMessage: 'SKU',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.promised.onHand',
                        defaultMessage: 'On hand',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.promised.held',
                        defaultMessage: 'Held',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.promised.free',
                        defaultMessage: 'Free',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.promised.backordered',
                        defaultMessage: 'Backordered',
                      })}
                    </TableCell>
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
                          {displayWithUnit(row.onHand, row.unitOfMeasure, intl)}
                        </TableCell>
                        <TableCell align="right">
                          {displayQuantity(row.held)}
                        </TableCell>
                        <TableCell align="right">
                          {displayQuantity(row.free)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={
                            row.backordered !== '0.0000'
                              ? { color: 'warning.main' }
                              : undefined
                          }
                        >
                          {displayQuantity(row.backordered)}
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
