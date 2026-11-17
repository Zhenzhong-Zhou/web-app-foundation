import {
  Alert,
  Button,
  ListSubheader,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom';

import { WhomToAskRead } from '../account/whom-to-ask';
import type {
  Location,
  ProductCategoryList,
  ProductDetail,
  StockCodeCounts,
  StockCodeRow,
  StockLotCounts,
  StockLotRow,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterChips } from '../components/filter-chips';
import {
  FilterRow,
  type QuickFilter,
  QuickFilterPill,
} from '../components/filter-row';
import { FiltersButton } from '../components/filters-button';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { SelectField } from '../components/select-field';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { api, messageFor } from '../lib/api';
import type { ProductType, StockCodeSort } from '../lib/api-names';
import { nameAndCode } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useCards } from '../lib/use-cards';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useKeysetList } from '../lib/use-keyset-list';
import { flag, id, oneOf, useListFilters } from '../lib/use-list-filters';
import { useListSearch } from '../lib/use-list-search';
import { type ListSort, useListSort } from '../lib/use-list-sort';
import { useLocations } from '../lib/use-locations';
import { leavesOf } from '../locations/tree';
import { categoryPlaces } from '../products/item-list';
import { PRODUCT_TYPES, productTypeLabel } from '../products/product-types';
import { NO_RECEIVE } from '../products/receive-line';
import { rem } from '../theme/rem';
import { EditLotDialog } from './edit-lot-dialog';
import { type MoveMode, MoveStockDialog } from './move-stock-dialog';
import {
  type HistoryOf,
  MovementHistoryDialog,
} from './movement-history-dialog';
import { ReceiveStockDialog } from './receive-stock-dialog';
import { type ReorderItem, ReorderPointDialog } from './reorder-point-dialog';
import type { Pile } from './stock-actions';
import { StockCodes, type StockHandlers } from './stock-codes';
import { StockLots } from './stock-lots';

/** A page of Inventory, fifty codes or lots (ADR-093, R16). */
const PAGE_SIZE = 50;

/** Group by Item, the default, or Lot (ADR-093, R4). */
const GROUPS = ['item', 'lot'] as const;
type Group = (typeof GROUPS)[number];

/**
 * What a row per code sorts by (ADR-057, amended by ADR-093); not Free,
 * which the server no longer sorts by (35a).
 */
const SORTS = [
  'name',
  'onHand',
  'expires',
] as const satisfies readonly StockCodeSort[];

/** Expiring soon's and Expired's order: the soonest first. */
const SOONEST: ListSort<StockCodeSort> = { key: 'expires', order: 'asc' };

/**
 * Stock's state in the address (ADR-093, R3; ADR-091): each filter, the
 * group and the sort, so a reload and Back keep them. `expiring=1` is
 * what Home's tile has always sent; `expired=1` its late button.
 */
const ADDRESS_FILTERS = {
  low: flag,
  out: flag,
  expiring: flag,
  expired: flag,
  needsCost: flag,
  includeEmpty: flag,
  locationId: id,
  productId: id,
  categoryId: id,
  type: oneOf<ProductType | ''>(['', ...PRODUCT_TYPES], ''),
  group: oneOf<Group>(GROUPS, 'item'),
};

/**
 * Inventory's Stock tab (ADR-093): a row per code, opening to its places
 * and their lots, or the Lot view, a row per lot at each place; the five
 * quick filters with their counts, Type, Category, Location and search,
 * all in the address; cards below 600 px, the filters a phone hides
 * behind one Filters button.
 */
export function StockTab({ tabs }: { tabs: ReactNode }) {
  const intl = useIntl();
  const can = useCan();
  const phone = useCards();
  // The organization's own days (ADR-060): what Expiring soon means here.
  const { warning: expiringWithin } = useExpiryDays();

  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const {
    low,
    out,
    expiring,
    expired,
    needsCost,
    includeEmpty,
    productId,
    categoryId,
    type,
    group,
  } = filters;
  const byLot = group === 'lot';
  // Sales sees stock but not places (ADR-080): no Location filter, and a
  // row opens straight to its lots.
  const seesPlaces = can('locations.view');
  // Asked again by Try again when the read fails (ADR-092's states).
  const [placesAgain, setPlacesAgain] = useState(0);
  const {
    locations,
    answered,
    failure: placesFailure,
  } = useLocations(seesPlaces, placesAgain);
  const placesFailed = answered && placesFailure !== null;
  const leaves = leavesOf(locations).filter((location) => location.isActive);
  // The place the address names: taken while the places are read, or
  // could not be, then only if stock can sit there; any other is
  // ignored, as Everywhere.
  const locationId =
    seesPlaces &&
    (!answered ||
      placesFailed ||
      leaves.some((location) => location.id === filters.locationId))
      ? filters.locationId
      : '';
  const place = leaves.find((location) => location.id === locationId) ?? null;

  // In the address, as every list's (#301): the lookup's "Show all" narrows
  // it while open.
  const { text, setText, search } = useListSearch();
  // By what expires first, soonest first, while Expiring soon or Expired
  // is on, until a header is chosen (ADR-091).
  const {
    sort,
    header,
    set: setSort,
    clear: clearSort,
  } = useListSort(SORTS, expiring || expired ? SOONEST : null);

  /** Bumped by Refresh and by every dialog that moves stock. */
  const [changes, setChanges] = useState(0);

  // The filters as the server reads them; Out has no lots to list (31a).
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (low) params.set('low', 'true');
    if (out && !byLot) params.set('out', 'true');
    if (expiring) params.set('expiringWithin', String(expiringWithin));
    if (expired) params.set('expired', 'true');
    if (needsCost) params.set('needsCost', 'true');
    if (type) params.set('type', type);
    if (categoryId) params.set('categoryId', categoryId);
    if (locationId) params.set('locationId', locationId);
    if (productId) params.set('productId', productId);
    if (includeEmpty) params.set('includeEmpty', 'true');
    if (search) params.set('search', search);
    return params.toString();
  }, [
    low,
    out,
    byLot,
    expiring,
    expiringWithin,
    expired,
    needsCost,
    type,
    categoryId,
    locationId,
    productId,
    includeEmpty,
    search,
  ]);
  // The list's own query, sorted: every row the export writes, in order.
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams(query);
    if (sort) {
      params.set('sort', sort.key);
      params.set('order', sort.order);
    }
    return params.toString();
  }, [query, sort]);
  const sorted = `limit=${PAGE_SIZE}${exportQuery ? `&${exportQuery}` : ''}`;
  const noLots = byLot && out;

  const codes = useKeysetList<StockCodeRow>(
    byLot ? null : `/stock/by-code?${sorted}`,
  );
  const lots = useKeysetList<StockLotRow>(
    byLot && !noLots
      ? `/stock/by-lot?limit=${PAGE_SIZE}${query ? `&${query}` : ''}`
      : null,
  );
  const list = byLot ? lots : codes;
  const rows: unknown[] | null = byLot ? lots.entries : codes.entries;
  const { reload } = list;

  const counts = useCounts(
    noLots ? null : `/stock/${byLot ? 'by-lot' : 'by-code'}/counts?${query}`,
    changes,
  );

  // The item a row's stock on Items opened, named on its chip (ADR-092):
  // by its rows; with none, by the item's own read.
  const firstName = productId
    ? ((codes.entries?.[0] ?? lots.entries?.[0])?.productName ?? null)
    : null;
  const namedItem = useItemName(
    productId !== '' && can('products.view') && rows?.length === 0
      ? productId
      : '',
  );
  const itemName = firstName ?? namedItem;

  const tree = useCategories(can('products.view'));
  const categories = tree ? categoryPlaces(tree.categories) : [];

  // Dialogs.
  const [receiving, setReceiving] = useState(false);
  const [params, setParams] = useSearchParams();
  const routed = useLocation();
  const asked = can('stock.move') && params.has('receive');
  const [moving, setMoving] = useState<{ mode: MoveMode; row: Pile } | null>(
    null,
  );
  const [viewing, setViewing] = useState<HistoryOf | null>(null);
  const [editingLot, setEditingLot] = useState<Pile | null>(null);
  const [reordering, setReordering] = useState<ReorderItem | null>(null);

  const refresh = async () => {
    reload();
    setChanges((count) => count + 1);
  };

  const handlers: StockHandlers = {
    canMove: can('stock.move'),
    canAdjust: can('stock.adjust'),
    canReorder: can('stock.reorder'),
    onMove: (mode, row) => setMoving({ mode, row }),
    onHistory: setViewing,
    onEditLot: setEditingLot,
    onReorder: setReordering,
  };

  if (list.refused) {
    return <RevisionRefusalPage failure={list.refused} onRetry={reload} />;
  }

  // Each quick filter, its count the rows it shows (R3); the Lot view's
  // four, no Out (31a); without their counts until a read answers.
  const quick: QuickFilter[] = [
    {
      id: 'low',
      label: intl.formatMessage({
        id: 'inventory.reorder.filter.low',
        defaultMessage: 'Low stock',
      }),
      count: counts?.low,
      pressed: low,
      onToggle: () => setFilters({ low: !low }),
    },
    ...(byLot
      ? []
      : [
          {
            id: 'out',
            label: intl.formatMessage({
              id: 'inventory.reorder.filter.out',
              defaultMessage: 'Out',
            }),
            count: counts && 'out' in counts ? counts.out : undefined,
            pressed: out,
            onToggle: () => setFilters({ out: !out }),
          },
        ]),
    {
      id: 'expiring',
      label: intl.formatMessage({
        id: 'inventory.quick.expiring',
        defaultMessage: 'Expiring soon',
      }),
      count: counts?.expiring,
      pressed: expiring,
      onToggle: () => setFilters({ expiring: !expiring }),
    },
    {
      id: 'expired',
      label: intl.formatMessage({
        id: 'inventory.filter.expired',
        defaultMessage: 'Expired',
      }),
      count: counts?.expired,
      pressed: expired,
      onToggle: () => setFilters({ expired: !expired }),
    },
    {
      id: 'needs-cost',
      label: intl.formatMessage({
        id: 'inventory.quick.needsCost',
        defaultMessage: 'Waiting for a cost',
      }),
      count: counts?.needsCost,
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
  ];

  const typeFilter = (
    <SelectField
      id="stock-type"
      size="small"
      label={intl.formatMessage({
        id: 'inventory.stock.type',
        defaultMessage: 'Type',
      })}
      emptyLabel={intl.formatMessage({
        id: 'inventory.stock.allTypes',
        defaultMessage: 'All types',
      })}
      value={type}
      onChange={(event) =>
        setFilters({ type: event.target.value as ProductType | '' })
      }
      sx={{ minWidth: rem(160) }}
    >
      {PRODUCT_TYPES.map((each) => (
        <MenuItem key={each} value={each}>
          {productTypeLabel(each, intl)}
        </MenuItem>
      ))}
    </SelectField>
  );

  const categoryFilter = can('products.view') && (
    <SelectField
      id="stock-category"
      size="small"
      label={intl.formatMessage({
        id: 'products.category',
        defaultMessage: 'Category',
      })}
      emptyLabel={intl.formatMessage({
        id: 'inventory.stock.allCategories',
        defaultMessage: 'All categories',
      })}
      value={tree ? categoryId : ''}
      onChange={(event) => setFilters({ categoryId: event.target.value })}
      sx={{ minWidth: rem(180) }}
    >
      {categories.map((category) => (
        <MenuItem
          key={category.id}
          value={category.id}
          sx={{ pl: 2 + category.depth * 2 }}
        >
          {category.name}
        </MenuItem>
      ))}
    </SelectField>
  );

  // Only places stock can sit in, grouped by their warehouse (20a).
  const locationFilter = seesPlaces && (
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
      value={answered ? locationId : ''}
      onChange={(event) => setFilters({ locationId: event.target.value })}
      sx={{ minWidth: rem(200) }}
    >
      {byWarehouse(locations, leaves).flatMap(([top, inIt]) => [
        <ListSubheader key={`top-${top.id}`}>{top.name}</ListSubheader>,
        ...inIt.map((location) => (
          <MenuItem key={location.id} value={location.id} sx={{ pl: 4 }}>
            {nameAndCode(location.name, location.code)}
          </MenuItem>
        )),
      ])}
    </SelectField>
  );

  const groupBy = (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography
        variant="body2"
        id="stock-group-by"
        sx={{ color: 'text.secondary' }}
      >
        {intl.formatMessage({
          id: 'inventory.groupBy',
          defaultMessage: 'Group by',
        })}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={group}
        aria-labelledby="stock-group-by"
        onChange={(_, next: Group | null) => {
          if (next) setFilters({ group: next });
        }}
      >
        <ToggleButton value="item">
          {intl.formatMessage({
            id: 'inventory.groupBy.item',
            defaultMessage: 'Item',
          })}
        </ToggleButton>
        <ToggleButton value="lot">
          {intl.formatMessage({
            id: 'inventory.groupBy.lot',
            defaultMessage: 'Lot',
          })}
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );

  // The sort a phone has no header for, in the sheet (#481).
  const sortField = !byLot && (
    <TextField
      select
      size="small"
      id="stock-sort"
      label={intl.formatMessage({
        id: 'products.sort',
        defaultMessage: 'Sort',
      })}
      value={`${sort?.key ?? 'name'}:${sort?.order ?? 'asc'}`}
      onChange={(event) => {
        const [key, order] = event.target.value.split(':') as [
          StockCodeSort,
          'asc' | 'desc',
        ];
        setSort(key, order);
      }}
    >
      {SORTS.flatMap((key) =>
        (['asc', 'desc'] as const).map((order) => (
          <MenuItem key={`${key}:${order}`} value={`${key}:${order}`}>
            {intl.formatMessage(
              {
                id: 'inventory.stock.sortBy',
                defaultMessage:
                  '{key, select, onHand {On hand, {order, select, desc {most first} other {least first}}} expires {Expires first, {order, select, desc {latest first} other {soonest first}}} other {Name, {order, select, desc {Z to A} other {A to Z}}}}',
              },
              { key, order },
            )}
          </MenuItem>
        )),
      )}
    </TextField>
  );

  const filtersOn = [type, categoryId, locationId].filter(Boolean).length;
  const exportPath = `/stock/${byLot ? 'by-lot' : 'by-code'}/export?${
    byLot ? query : exportQuery
  }`;
  const anyFilter =
    low ||
    out ||
    expiring ||
    expired ||
    needsCost ||
    !!type ||
    !!categoryId ||
    !!locationId ||
    !!productId ||
    !!search;
  // One item alone, as a row's stock on Items opens it, and nothing else.
  const onlyItem =
    !!productId &&
    !low &&
    !out &&
    !expiring &&
    !expired &&
    !needsCost &&
    !type &&
    !categoryId &&
    !locationId &&
    !search;
  const clearFilters = () => {
    setText('');
    setFilters({
      low: false,
      out: false,
      expiring: false,
      expired: false,
      needsCost: false,
      type: '',
      categoryId: '',
      locationId: '',
      productId: '',
    });
  };

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
            {/* Every row the filters match, as the list groups them, in
                the screen's words (R15). */}
            {!noLots && <ExportButton path={exportPath} />}
            {/* A recall starts from a code off a label (ADR-044). */}
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
              disabled={list.loading && !noLots}
              onClick={() => void refresh()}
            >
              {intl.formatMessage({
                id: 'common.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>
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

      {/* A failed read of the places says so, with Try again; it is
          never "Add a location" (ADR-092's states). */}
      {placesFailed && (
        <ListError
          error={messageFor(placesFailure)}
          onRetry={() => setPlacesAgain((again) => again + 1)}
        />
      )}

      {answered && !placesFailed && seesPlaces && !leaves.length && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'inventory.needsLocation',
            defaultMessage:
              'Add a location before receiving stock. Stock sits in the places that contain nothing else — a bin, a shelf, or a whole warehouse if you have not divided it up yet.',
          })}
        </Alert>
      )}

      {/* The one filter row (ADR-055): the search reaches the item, its
          code and a lot's code. On a phone, Type, Category, Location and
          the sort go in the Filters button's sheet (#481). */}
      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.stock.search',
            defaultMessage: 'Search items, codes or lots',
          }),
          value: text,
          onChange: setText,
        }}
        quick={phone ? [] : quick}
      >
        {phone ? (
          <FiltersButton
            on={filtersOn}
            shown={null}
            onClear={() =>
              clearSort({ type: null, categoryId: null, locationId: null })
            }
          >
            {typeFilter}
            {categoryFilter}
            {locationFilter}
            {sortField}
          </FiltersButton>
        ) : (
          <>
            {typeFilter}
            {categoryFilter}
            {locationFilter}
          </>
        )}
        {groupBy}
      </FilterRow>

      {phone && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          {quick.map((filter) => (
            <QuickFilterPill key={filter.id} filter={filter} />
          ))}
        </Stack>
      )}

      {/* What a link narrowed that no button shows, removable: a row's
          stock on Items, the item alone. */}
      <FilterChips
        chips={[
          productId !== '' && {
            id: 'item',
            label: itemName
              ? intl.formatMessage(
                  {
                    id: 'inventory.filter.item',
                    defaultMessage: 'Item: {name}',
                  },
                  { name: itemName },
                )
              : intl.formatMessage({
                  id: 'inventory.filter.oneItem',
                  defaultMessage: 'One item',
                }),
            onRemove: () => setFilters({ productId: '' }),
          },
          place !== null && {
            id: 'place',
            label: nameAndCode(place.name, place.code),
            onRemove: () => setFilters({ locationId: '' }),
          },
        ]}
      />

      {/* One place: what is there, Free and Held the whole item's (20a). */}
      {place && !byLot && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.stock.oneIntro',
              defaultMessage:
                'Showing what is on {place}. Free and Held count every place, since a sale is not held on a shelf.',
            },
            { place: place.name },
          )}
        </Typography>
      )}

      {byLot && !noLots && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'inventory.lots.order',
            defaultMessage: 'Soonest first, the expired on top.',
          })}
        </Typography>
      )}

      {/* The list's part alone says it could not be read, with Try again;
          the filters stay. */}
      {list.failed && <ListError error={list.error} onRetry={reload} />}

      {noLots ? (
        <Paper variant="outlined">
          <EmptyState
            action={
              <Button onClick={() => setFilters({ group: 'item' })}>
                {intl.formatMessage({
                  id: 'inventory.lots.byItem',
                  defaultMessage: 'Group by Item',
                })}
              </Button>
            }
          >
            {intl.formatMessage({
              id: 'inventory.lots.outEmpty',
              defaultMessage: 'Items that are out have no lots.',
            })}
          </EmptyState>
        </Paper>
      ) : (
        !list.failed && (
          <Paper variant="outlined">
            {list.loading || rows?.length ? (
              byLot ? (
                <StockLots
                  rows={lots.entries}
                  loading={lots.loading}
                  seesPlaces={seesPlaces}
                  handlers={handlers}
                />
              ) : (
                <StockCodes
                  rows={codes.entries}
                  loading={codes.loading}
                  seesPlaces={seesPlaces}
                  place={place}
                  includeEmpty={includeEmpty}
                  header={header}
                  handlers={handlers}
                  changes={changes}
                />
              )
            ) : (
              <EmptyState
                learnMore={
                  anyFilter
                    ? undefined
                    : { guide: 'inventory', section: 'receive' }
                }
                action={
                  anyFilter ? (
                    <Button variant="text" onClick={clearFilters}>
                      {intl.formatMessage({
                        id: 'inventory.stock.showAll',
                        defaultMessage: 'Show all stock',
                      })}
                    </Button>
                  ) : can('stock.move') && leaves.length > 0 ? (
                    <Button onClick={openDialog(() => setReceiving(true))}>
                      {intl.formatMessage({
                        id: 'inventory.receive',
                        defaultMessage: 'Receive stock',
                      })}
                    </Button>
                  ) : !can('stock.move') ? (
                    // Where Receive stock would be, who can and whom to ask
                    // (ADR-093's states; ADR-079).
                    <WhomToAskRead {...NO_RECEIVE} />
                  ) : undefined
                }
              >
                {onlyItem && itemName
                  ? // The item a row's stock on Items opened, by name
                    // (ADR-092's review, 90).
                    intl.formatMessage(
                      {
                        id: 'inventory.emptyItem',
                        defaultMessage: '{name} has no stock yet.',
                      },
                      { name: itemName },
                    )
                  : !anyFilter
                    ? intl.formatMessage({
                        id: 'inventory.stock.firstUse',
                        defaultMessage:
                          'No stock yet. Receive what you have, and it shows here, one row per item.',
                      })
                    : low && !byLot && counts?.low === 0
                      ? // Done, naming the items with no reorder point,
                        // which are never low (ADR-093's states).
                        intl.formatMessage({
                          id: 'inventory.stock.nothingLow',
                          defaultMessage:
                            'Nothing is low. An item with no reorder point is never low: set one on Reorder.',
                        })
                      : byLot
                        ? intl.formatMessage({
                            id: 'inventory.lots.noMatch',
                            defaultMessage: 'No lots match these filters.',
                          })
                        : intl.formatMessage({
                            id: 'inventory.stock.noMatch',
                            defaultMessage: 'No items match these filters.',
                          })}
              </EmptyState>
            )}
          </Paper>
        )
      )}

      {!noLots && !list.failed && rows && (
        <LoadMoreButton
          hasMore={list.hasMore}
          loading={list.loadingMore}
          failed={!!list.error}
          pageSize={PAGE_SIZE}
          onLoadMore={list.loadMore}
        />
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

      {/* A point moves no stock, but the row's status, its "left · reorder
          at" line and the Low stock count come from it: read again. */}
      {reordering && (
        <ReorderPointDialog
          opening={{ kind: 'find', item: reordering }}
          onClose={() => setReordering(null)}
          onSaved={() => {
            setReordering(null);
            void refresh();
          }}
        />
      )}
    </Stack>
  );
}

/**
 * The counts beside the quick filters, read with the list's other
 * filters (R3) and again after a change; null while not read, or when the
 * read fails, so the filters stay without them.
 */
function useCounts(
  path: string | null,
  changes: number,
): (Partial<StockCodeCounts> & StockLotCounts) | null {
  const [read, setRead] = useState<{
    path: string;
    counts: StockCodeCounts | StockLotCounts;
  } | null>(null);

  useEffect(() => {
    if (path === null) return;
    let ignore = false;
    void api<StockCodeCounts | StockLotCounts>(path)
      .then((counts) => {
        if (!ignore) setRead({ path, counts });
      })
      // Silent: without a count the button still works.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [path, changes]);

  return read && read.path === path ? read.counts : null;
}

/**
 * The categories, for the Category filter, read once for a reader who may
 * see items; null until they come, or when they cannot be read.
 */
function useCategories(active: boolean): ProductCategoryList | null {
  const [tree, setTree] = useState<ProductCategoryList | null>(null);

  useEffect(() => {
    if (!active) return;
    let ignore = false;
    void api<ProductCategoryList>('/products/categories')
      .then((answer) => {
        if (!ignore) setTree(answer);
      })
      // Silent: without them the filter offers none.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [active]);

  return tree;
}

/** The item's name, by its own read, in the language it was asked in. */
function useItemName(productId: string): string | null {
  const intl = useIntl();
  const key = `${intl.locale} ${productId}`;
  const [named, setNamed] = useState<{ key: string; name: string } | null>(
    null,
  );

  useEffect(() => {
    if (!productId) return;
    let ignore = false;
    void api<ProductDetail>(`/products/${productId}`)
      .then((product) => {
        if (!ignore) setNamed({ key, name: product.displayName });
      })
      // Silent: the chip still says one item, and its × still works.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [productId, key]);

  return named?.key === key ? named.name : null;
}

/**
 * The places stock can sit in, under the place at the top of the tree
 * they are in, their warehouse or site (20a), each group by name as the
 * tree sends them.
 */
function byWarehouse(
  all: Location[],
  leaves: Location[],
): [Location, Location[]][] {
  const byId = new Map(all.map((location) => [location.id, location]));
  const topOf = (location: Location): Location => {
    let at = location;
    const seen = new Set<string>();
    while (at.parentId && byId.has(at.parentId) && !seen.has(at.id)) {
      seen.add(at.id);
      at = byId.get(at.parentId)!;
    }
    return at;
  };

  const groups = new Map<string, [Location, Location[]]>();
  for (const leaf of leaves) {
    const top = topOf(leaf);
    const entry = groups.get(top.id) ?? [top, []];
    entry[1].push(leaf);
    groups.set(top.id, entry);
  }
  return [...groups.values()];
}
