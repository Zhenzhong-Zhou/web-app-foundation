import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom';

import type { Availability, Location, StockRow } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExpiryChip } from '../components/expiry-chip';
import { ExportButton } from '../components/export-button';
import { FilterChips } from '../components/filter-chips';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { PlaceholderRows } from '../components/placeholder-rows';
import { ProductCover } from '../components/product-cover';
import { Reference } from '../components/reference';
import { SelectField } from '../components/select-field';
import { SortHeader } from '../components/sort-header';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { api, messageFor } from '../lib/api';
import {
  displayQuantity,
  itemName,
  nameAndCode,
  NO_VALUE,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useKeysetList } from '../lib/use-keyset-list';
import { flag, id, useListFilters } from '../lib/use-list-filters';
import { useListSearch } from '../lib/use-list-search';
import { type ListSort, useListSort } from '../lib/use-list-sort';
import { useTab } from '../lib/use-tab';
import { displayWithUnit } from '../products/units';
import { rem } from '../theme/rem';
import { EditLotDialog } from './edit-lot-dialog';
import { type MoveMode, MoveStockDialog } from './move-stock-dialog';
import { MovementHistoryDialog } from './movement-history-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';
import { ReorderPointDialog } from './reorder-point-dialog';
import { ReorderPointsTab } from './reorder-points-tab';
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

/** Inventory's two views (ADR-085): what is where, and what runs short. */
const INVENTORY_TABS = ['stock', 'reorder-points'] as const;
type InventoryTab = (typeof INVENTORY_TABS)[number];

const TAB_LABEL = defineMessages<InventoryTab>({
  stock: { id: 'inventory.tab.stock', defaultMessage: 'Stock' },
  'reorder-points': {
    id: 'inventory.tab.reorderPoints',
    defaultMessage: 'Reorder points',
  },
});

/**
 * Inventory: Stock, and Reorder points beside it (ADR-085), the open one
 * in the address as `?tab=` (useTab). Each tab draws the page's header
 * with its own actions, then the tabs, then its list; only the open one
 * is drawn, so the tabs name no panel.
 */
export function InventoryPage() {
  const intl = useIntl();
  const [tab, setTab] = useTab<InventoryTab>(INVENTORY_TABS);

  const tabs = (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={tab}
        onChange={(_, next: InventoryTab) => setTab(next)}
        aria-label={intl.formatMessage({
          id: 'layout.nav.inventory',
          defaultMessage: 'Inventory',
        })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {INVENTORY_TABS.map((id) => (
          <Tab key={id} value={id} label={intl.formatMessage(TAB_LABEL[id])} />
        ))}
      </Tabs>
    </Box>
  );

  return tab === 'stock' ? (
    <StockTab tabs={tabs} />
  ) : (
    <ReorderPointsTab tabs={tabs} />
  );
}

/**
 * The Stock tab's filters, in the address (ADR-091): Home's tiles open it
 * narrowed, `?expiring=1`, and what is pressed or chosen here is kept
 * there. "Expiring soon" is lots within the amber threshold, the expired
 * included; "Expired" is those past their day alone, which Home's late
 * button adds; "Waiting for a cost" is stock whose value is still provisional
 * (ADR-048).
 */
const ADDRESS_FILTERS = {
  expiring: flag,
  expired: flag,
  needsCost: flag,
  includeEmpty: flag,
  locationId: id,
};

/** Expiring soon's and Expired's order: the soonest first, the expired leading. */
const SOONEST_EXPIRY: ListSort<'expiry'> = { key: 'expiry', order: 'asc' };

/**
 * One screen for receiving stock and seeing what is where.
 *
 * Deliberately not a warehouse tree. A tree of empty locations proves the
 * locations module works and nothing else; this exercises products, locations,
 * and the movements ledger against each other, which is the only way to find
 * out whether the three actually fit together.
 */
function StockTab({ tabs }: { tabs: ReactNode }) {
  const intl = useIntl();
  const can = useCan();
  // The organization's own days (ADR-060): what Expiring soon means here.
  const { warning: expiringWithin } = useExpiryDays();

  const [locations, setLocations] = useState<Location[] | null>(null);
  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const { expiring, expired, needsCost, includeEmpty } = filters;
  // Sales sees stock but not locations (ADR-080): the page asks only for
  // what its reader may read, and leaves the Location filter out.
  const canSeeLocations = can('locations.view');
  const leaves = locations ? leavesOf(locations) : [];
  // The place the address names: taken while the locations are read, then
  // only if stock can sit there; any other is ignored, as Everywhere.
  const locationId =
    canSeeLocations &&
    (locations === null ||
      leaves.some((location) => location.id === filters.locationId))
      ? filters.locationId
      : '';
  // In the address, as every list's (#301): the lookup's "Show all" narrows
  // it while open, and Reorder points shares it, the same ?search=.
  const { text: searchText, setText: setSearchText, search } = useListSearch();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  // Home's Receive stock opens it through the address, ?receive, once
  // there is a place to receive into. Closing takes it off, so Back or a
  // reload does not open it again (#502).
  const [params, setParams] = useSearchParams();
  const routed = useLocation();
  const asked = can('stock.move') && params.has('receive');
  const [moving, setMoving] = useState<{
    mode: MoveMode;
    row: StockRow;
  } | null>(null);
  const [viewing, setViewing] = useState<StockRow | null>(null);
  // By the lot's expiry when its header is chosen (ADR-057), and, with
  // Expiring soon or Expired on, soonest first until one is (ADR-091).
  const { sort, header } = useListSort(
    ['expiry'],
    expiring || expired ? SOONEST_EXPIRY : null,
  );
  const [expiringCount, setExpiringCount] = useState<number | null>(null);
  const [needsCostCount, setNeedsCostCount] = useState<number | null>(null);
  /** Bumped by Refresh and by every dialog that moves stock. */
  const [changes, setChanges] = useState(0);
  const [editingLot, setEditingLot] = useState<StockRow | null>(null);
  // The item's reorder point, from its row's menu (ADR-085).
  const [reordering, setReordering] = useState<StockRow | null>(null);

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
    if (expiring) params.set('expiringWithin', String(expiringWithin));
    if (expired) params.set('expired', 'true');
    if (needsCost) params.set('needsCost', 'true');
    if (sort) {
      params.set('sort', sort.key);
      params.set('order', sort.order);
    }
    return `/stock?${params.toString()}`;
  }, [
    locationId,
    includeEmpty,
    search,
    expiring,
    expiringWithin,
    expired,
    needsCost,
    sort,
  ]);

  /**
   * The count beside "Expiring soon", with the list's other filters, so it
   * is the number of rows pressing it shows (GET /stock/counts).
   */
  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams({
      expiringWithin: String(expiringWithin),
    });
    if (locationId) params.set('locationId', locationId);
    if (includeEmpty) params.set('includeEmpty', 'true');
    if (search) params.set('search', search);

    void api<{ expiring: number; needsCost: number }>(
      `/stock/counts?${params.toString()}`,
    )
      .then((counts) => {
        if (ignore) return;
        setExpiringCount(counts.expiring);
        setNeedsCostCount(counts.needsCost);
      })
      // Silent: without a count the button still works.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [locationId, includeEmpty, search, expiringWithin, changes]);

  const {
    entries: rows,
    error: listError,
    refused,
    failed,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<StockRow>(stockPath);

  const error = listError ?? setupError;

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
      canSeeLocations ? api<Location[]>('/locations') : Promise.resolve(null),
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
  }, [canSeeLocations]);

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.inventory',
          defaultMessage: 'Inventory',
        })}
        actions={
          <>
            {/* Every row the filters match, not the page (ADR-057). */}
            <ExportButton
              path={stockPath
                .replace('/stock?', '/stock/export?')
                .replace(/(^|[?&])limit=\d+&?/, '$1')}
            />
            {/* A recall starts from a code off a label (ADR-044). Back
                returns here (#341). */}
            <Button
              variant="text"
              component={RouterLink}
              to="/lots"
              state={OFFER_BACK}
            >
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
          </>
        }
      />

      {tabs}

      <ListError error={error} onRetry={failed ? reload : undefined} />

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
            onToggle: () => setFilters({ expiring: !expiring }),
          },
          {
            id: 'needs-cost',
            label: intl.formatMessage({
              id: 'inventory.quick.needsCost',
              defaultMessage: 'Waiting for a cost',
            }),
            count: needsCostCount ?? undefined,
            pressed: needsCost,
            onToggle: () => setFilters({ needsCost: !needsCost }),
          },
          {
            id: 'emptied',
            label: intl.formatMessage({
              id: 'inventory.showEmptied',
              defaultMessage: 'Show emptied',
            }),
            pressed: includeEmpty,
            onToggle: () => setFilters({ includeEmpty: !includeEmpty }),
          },
        ]}
      >
        {canSeeLocations && (
          <SelectField
            id="stock-location"
            size="small"
            label={intl.formatMessage({
              id: 'inventory.location',
              defaultMessage: 'Location',
            })}
            emptyLabel={intl.formatMessage({
              id: 'inventory.everywhere',
              defaultMessage: 'Everywhere',
            })}
            value={locations === null ? '' : locationId}
            onChange={(event) => setFilters({ locationId: event.target.value })}
            sx={{ minWidth: rem(200) }}
          >
            {leaves.map((location) => (
              <MenuItem key={location.id} value={location.id}>
                {nameAndCode(location.name, location.code)}
              </MenuItem>
            ))}
          </SelectField>
        )}
      </FilterRow>

      {/* What a link narrowed that no button shows, removable: Home's
          late button, the expired lots alone. */}
      <FilterChips
        chips={[
          expired && {
            id: 'expired',
            label: intl.formatMessage({
              id: 'inventory.filter.expired',
              defaultMessage: 'Expired',
            }),
            onRemove: () => setFilters({ expired: false }),
          },
        ]}
      />

      {!failed && (
        <Paper variant="outlined">
          {/* The table's head stays while the rows are read, a sort's
              included, so the header pressed keeps its focus (#505's 54). */}
          {loading || rows?.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'products.sku',
                        defaultMessage: 'Code',
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
                    <SortHeader
                      label={intl.formatMessage({
                        id: 'inventory.lot.expires',
                        defaultMessage: 'Expires',
                      })}
                      {...header('expiry')}
                    />
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
                  {loading && <PlaceholderRows columns={7} />}
                  {rows?.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Reference>{row.sku}</Reference>
                      </TableCell>
                      {/* The product, with the variant when it has a name of
                      its own — "Focus (60ct)" — as the packing slip and the
                      variant picker already say it. */}
                      <TableCell>
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: 'center' }}
                        >
                          <ProductCover
                            fileId={row.coverFileId}
                            name={row.productName}
                          />
                          <span>
                            {itemName(row.productName, row.variantName)}
                          </span>
                        </Stack>
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

                      {/* For everyone here: History and Trace lot only
                      read. The menu holds what this member may do. */}
                      <TableCell padding="checkbox">
                        <StockActions
                          row={row}
                          canMove={can('stock.move')}
                          canAdjust={canAdjust}
                          onSelect={(mode, selected) =>
                            setMoving({ mode, row: selected })
                          }
                          onHistory={setViewing}
                          onEditLot={setEditingLot}
                          canReorder={can('stock.reorder')}
                          onReorder={setReordering}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState learnMore={{ guide: 'inventory', section: 'receive' }}>
              {expired
                ? intl.formatMessage({
                    id: 'inventory.noneExpired',
                    defaultMessage: 'No lot here has expired.',
                  })
                : needsCost && !expiring
                  ? intl.formatMessage({
                      id: 'inventory.noneNeedsCost',
                      defaultMessage: 'Everything here has a cost.',
                    })
                  : expiring
                    ? intl.formatMessage(
                        {
                          id: 'inventory.noneExpiring',
                          defaultMessage:
                            'No lot here expires within {days} days.',
                        },
                        { days: expiringWithin },
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
      )}

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
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                        defaultMessage: 'Code',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.item',
                        defaultMessage: 'Item',
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
                        <TableCell>
                          <Reference>{row.sku}</Reference>
                        </TableCell>
                        {/* In the reader's language, as Stock above names
                          it (#296). */}
                        <TableCell>
                          {itemName(row.productName, row.variantName)}
                        </TableCell>
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
        open={receiving || (asked && leaves.length > 0)}
        locations={leaves}
        defaultLocationId={locationId}
        onClose={() => {
          setReceiving(false);
          if (asked) {
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete('receive');
                return next;
              },
              // The link's state kept, so Back stays (#341).
              { replace: true, state: routed.state },
            );
          }
        }}
        onReceived={refresh}
      />

      {moving && (
        <MoveStockDialog
          mode={moving.mode}
          row={moving.row}
          locations={leaves}
          canSeePartners={can('partners.view')}
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

      {/* A point moves no stock, so nothing here reads again after it. */}
      {reordering && (
        <ReorderPointDialog
          opening={{ kind: 'find', item: reordering }}
          onClose={() => setReordering(null)}
          onSaved={() => setReordering(null)}
        />
      )}
    </Stack>
  );
}
