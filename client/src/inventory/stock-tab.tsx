import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { type ReactNode, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { WhomToAskRead } from '../account/whom-to-ask';
import type {
  Delivery,
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
import { ShowingLine } from '../components/showing-line';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { messageFor, withQuery } from '../lib/api';
import type {
  ProductType,
  StockCodeSort,
  StockLotSort,
} from '../lib/api-names';
import { nameAndCode } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { leftFrom } from '../lib/return-focus';
import { useCards } from '../lib/use-cards';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useKeysetList } from '../lib/use-keyset-list';
import {
  flag,
  id,
  oneOf,
  useAddressWrite,
  useListFilters,
} from '../lib/use-list-filters';
import { useListSearch } from '../lib/use-list-search';
import { type ListSort, useListSort, withSort } from '../lib/use-list-sort';
import { useLocations } from '../lib/use-locations';
import { useResource } from '../lib/use-resource';
import { useRowReturn } from '../lib/use-row-return';
import { leavesOf } from '../locations/tree';
import { ReceiveLineDialog } from '../orders/receive-line-dialog';
import { categoryPlaces } from '../products/item-list';
import { PRODUCT_TYPES, productTypeLabel } from '../products/product-types';
import { NO_RECEIVE } from '../products/receive-line';
import { rem } from '../theme/rem';
import { CountInDialog, type CountInItem } from './count-in-dialog';
import { EditLotDialog } from './edit-lot-dialog';
import { type MoveMode, MoveStockDialog } from './move-stock-dialog';
import { PlaceFilter } from './place-filter';
import { ReceiveStockDialog } from './receive-stock-dialog';
import { type ReorderItem, ReorderPointDialog } from './reorder-point-dialog';
import type { Pile } from './stock-actions';
import { StockCodes, type StockHandlers } from './stock-codes';
import { StockLots } from './stock-lots';
import { openKey } from './stock-places';

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

/** The list's own order, by the item's name, marked on its header. */
const BY_NAME: ListSort<StockCodeSort> = { key: 'name', order: 'asc' };

/**
 * What the Lot view's headers sort by (Bob's third message, 7): Expires,
 * its own order, soonest first and the expired on top; the item, the
 * place or the quantity, either way.
 */
const LOT_SORTS = [
  'expires',
  'item',
  'location',
  'quantity',
] as const satisfies readonly StockLotSort[];
const BY_EXPIRES: ListSort<StockLotSort> = { key: 'expires', order: 'asc' };

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
  const navigate = useNavigate();
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
  const {
    locations,
    answered,
    failure: placesFailure,
    retry: retryPlaces,
  } = useLocations(seesPlaces);
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
  } = useListSort(SORTS, expiring || expired ? SOONEST : BY_NAME);
  // The Lot view's, from the same address: a key it does not know is the
  // other view's, and leaves it in its own order.
  const lotSort = useListSort(LOT_SORTS, BY_EXPIRES);
  const lotsInOwnOrder = lotSort.sort === BY_EXPIRES;

  /** Bumped by Refresh and by every dialog that moves stock. */
  const [changes, setChanges] = useState(0);

  // The filters as the server reads them; Out has no lots to list (31a).
  // The list's filters as its address asks them, each left out unset.
  const query: Record<string, string | undefined> = {
    low: low ? 'true' : undefined,
    out: out && !byLot ? 'true' : undefined,
    expiringWithin: expiring ? String(expiringWithin) : undefined,
    expired: expired ? 'true' : undefined,
    needsCost: needsCost ? 'true' : undefined,
    type: type || undefined,
    categoryId: categoryId || undefined,
    locationId: locationId || undefined,
    productId: productId || undefined,
    includeEmpty: includeEmpty ? 'true' : undefined,
    search: search || undefined,
  };
  const limit = String(PAGE_SIZE);
  const noLots = byLot && out;

  // By the item's name unless a header sorts it, the server's own order,
  // so it is not sent; the Lot view has its own one order.
  const served = sort === BY_NAME ? null : sort;
  const codesPath = withSort(
    withQuery('/stock/by-code', { limit, ...query }),
    served,
  );
  // The rows shown kept for Back, which reads them again (#473).
  const routed = useLocation();
  const codes = useKeysetList<StockCodeRow>(byLot ? null : codesPath, {
    keep: routed.key,
  });
  const lotsPath = withSort(
    withQuery('/stock/by-lot', { limit, ...query }),
    lotsInOwnOrder ? null : lotSort.sort,
  );
  const lots = useKeysetList<StockLotRow>(byLot && !noLots ? lotsPath : null, {
    keep: routed.key,
  });
  const list = byLot ? lots : codes;

  // Show 50 more: focus on the first new code once it is there, as Items
  // does (ADR-093's Stock table); a new list forgets it.
  const [firstNew, setFirstNew] = useState<{
    path: string | null;
    index: number;
  } | null>(null);
  const newCode =
    firstNew && firstNew.path === codesPath
      ? (codes.entries?.[firstNew.index]?.variantId ?? null)
      : null;
  const loadMore = () => {
    if (!byLot) {
      setFirstNew({ path: codesPath, index: codes.entries?.length ?? 0 });
    }
    void list.loadMore();
  };
  const rows: unknown[] | null = byLot ? lots.entries : codes.entries;
  const { reload } = list;

  // Beside the quick filters, read with the list's other filters (R3);
  // silent, so without them the buttons still work.
  const countsRead = useResource<StockCodeCounts | StockLotCounts>(
    noLots
      ? null
      : withQuery(`/stock/${byLot ? 'by-lot' : 'by-code'}/counts`, query),
  );
  const counts = countsRead.data as
    (Partial<StockCodeCounts> & StockLotCounts) | null;

  // The item a row's stock on Items opened, named on its chip (ADR-092):
  // by its rows; with none, by the item's own read.
  const firstName = productId
    ? ((codes.entries?.[0] ?? lots.entries?.[0])?.productName ?? null)
    : null;
  const namedItem =
    useResource<ProductDetail>(
      productId !== '' && can('products.view') && rows?.length === 0
        ? `/products/${productId}`
        : null,
    ).data?.displayName ?? null;
  const itemName = firstName ?? namedItem;

  // Silent: without them the Category filter offers none.
  const tree = useResource<ProductCategoryList>(
    can('products.view') ? '/products/categories' : null,
  ).data;
  const categories = tree ? categoryPlaces(tree.categories) : [];

  // Dialogs.
  const [receiving, setReceiving] = useState(false);
  /** The item an item's Receive stock… opened the dialog for, filled in. */
  const [receivingItem, setReceivingItem] = useState<string | null>(null);
  /** The delivery chosen for it, received on its order's line (ADR-093, v3). */
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [params] = useSearchParams();
  // The rows open, in the address so Back finds them open (ADR-093's
  // Stock table), and the row Back returns focus to, once.
  const writeAddress = useAddressWrite();
  const opens = (params.get('open') ?? '').split(',').filter(Boolean);
  const { returned, rowReturn } = useRowReturn();
  const focusRow = returned?.row ?? null;
  const asked = can('stock.move') && params.has('receive');
  const [moving, setMoving] = useState<{ mode: MoveMode; row: Pile } | null>(
    null,
  );
  const [editingLot, setEditingLot] = useState<Pile | null>(null);
  const [countingIn, setCountingIn] = useState<CountInItem | null>(null);
  // Count it in… from Receive stock's Found in a count, at its place (R12).
  const [foundAt, setFoundAt] = useState<string | null>(null);
  const [reordering, setReordering] = useState<ReorderItem | null>(null);

  function closeReceiving() {
    setReceiving(false);
    setReceivingItem(null);
    // The link's state kept, so Back stays (#341); written as the row
    // opened after a receipt is, so neither undoes the other.
    if (asked) writeAddress({ receive: null });
  }

  const refresh = async () => {
    reload();
    void countsRead.reload();
    setChanges((count) => count + 1);
  };

  const handlers: StockHandlers = {
    canMove: can('stock.move'),
    canAdjust: can('stock.adjust'),
    canReorder: can('stock.reorder'),
    onMove: (mode, row) => setMoving({ mode, row }),
    onLeave: (variantId) => leftFrom(routed.key, variantId),
    onEditLot: setEditingLot,
    onReorder: setReordering,
    onReceive: (variantId) => {
      setReceivingItem(variantId);
      setReceiving(true);
    },
    onCountIn: setCountingIn,
  };

  // Codes and places in the address, not a list a person reads; a code
  // closed closes its places too.
  const openRow = (key: string, open: boolean) => {
    const next = opens.filter(
      (each) => each !== key && !each.startsWith(`${key}.`),
    );
    if (open) next.push(key);
    writeAddress({ open: next.length ? String(next) : null });
  };

  // Received: the code's row open, at its place, its lots open (ADR-094's
  // table), as Count it in… lands.
  const openReceived = ({
    variantId,
    locationId,
  }: {
    variantId: string;
    locationId: string;
  }) => {
    const place = openKey(variantId, locationId);
    const next = opens.filter((each) => each !== variantId && each !== place);
    writeAddress({ open: String([...next, variantId, place]) });
  };

  if (list.refused) {
    return <RevisionRefusalPage failure={list.refused} onRetry={reload} />;
  }

  // Each quick filter, its count the rows it shows (R3), saying so: codes,
  // or lots on the Lot view (108a); the Lot view's four, no Out (31a);
  // without their counts until a read answers.
  const of: QuickFilter['of'] = byLot ? 'lot' : 'code';
  const quick: QuickFilter[] = [
    {
      id: 'low',
      label: intl.formatMessage({
        id: 'inventory.reorder.filter.low',
        defaultMessage: 'Low stock',
      }),
      count: counts?.low,
      of,
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
            of,
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
      of,
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
      of,
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
      of,
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
    <PlaceFilter
      id="stock-location"
      locations={locations}
      leaves={leaves}
      value={answered ? locationId : ''}
      onChange={(next) => setFilters({ locationId: next })}
    />
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
  const exportPath = withSort(
    withQuery(`/stock/${byLot ? 'by-lot' : 'by-code'}/export`, query),
    byLot ? (lotsInOwnOrder ? null : lotSort.sort) : served,
  );
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
  // The search and the filters in one write, each at its default, left
  // out; the box follows the address once the page shows it. Emptied
  // here first, the box would write the search itself from the address
  // still shown, which react-router shows in a transition: one finished
  // after the search's wait put a filter back (PR CI runs 747 and 749).
  const clearFilters = () =>
    writeAddress({
      search: null,
      low: null,
      out: null,
      expiring: null,
      expired: null,
      needsCost: null,
      type: null,
      categoryId: null,
      locationId: null,
      productId: null,
    } satisfies Partial<Record<keyof typeof ADDRESS_FILTERS | 'search', null>>);

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
        <ListError error={messageFor(placesFailure)} onRetry={retryPlaces} />
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
      {/* The quick filters on a row of their own, above the search and the
          rest, as v2's board draws them; on a phone, in the Filters sheet
          (Bob's third message, 6). */}
      {!phone && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          {quick.map((filter) => (
            <QuickFilterPill key={filter.id} filter={filter} />
          ))}
        </Stack>
      )}

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.stock.search',
            defaultMessage: 'Search items, codes or lots',
          }),
          value: text,
          onChange: setText,
        }}
      >
        {phone ? (
          <FiltersButton
            on={filtersOn + quick.filter((filter) => filter.pressed).length}
            shown={null}
            onClear={() =>
              clearSort({
                type: null,
                categoryId: null,
                locationId: null,
                low: null,
                out: null,
                expiring: null,
                expired: null,
                needsCost: null,
                includeEmpty: null,
              })
            }
          >
            {typeFilter}
            {categoryFilter}
            {locationFilter}
            {sortField}
            {quick.map((filter) => (
              <QuickFilterPill
                key={filter.id}
                filter={filter}
                sx={{ alignSelf: 'flex-start' }}
              />
            ))}
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

      {/* Said only while it is the order (Bob's third message, 7). */}
      {byLot && !noLots && lotsInOwnOrder && (
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
                  rowReturn={rowReturn}
                  header={lotSort.header}
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
                  opens={opens}
                  onOpen={openRow}
                  focusRow={newCode ?? focusRow}
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
          onLoadMore={loadMore}
          before={
            rows.length > 0 && (
              <ShowingLine
                shown={rows.length}
                total={counts?.total}
                more={list.hasMore}
                of={byLot ? 'lot' : 'code'}
              />
            )
          }
        />
      )}

      <ReceiveStockDialog
        key={receivingItem ?? 'any'}
        open={receiving || (asked && leaves.length > 0)}
        locations={leaves}
        tree={locations}
        defaultLocationId={locationId}
        defaultVariantId={receivingItem ?? ''}
        canSeePartners={can('partners.view')}
        counting={!!countingIn && foundAt !== null}
        onClose={closeReceiving}
        onReceived={async (received) => {
          openReceived(received);
          await refresh();
        }}
        // Asked of whoever may see orders and receive on them.
        onDelivery={
          can('orders.view') && can('orders.receive') ? setDelivery : undefined
        }
        // Found in a count, for whoever may correct counts (R12).
        onFoundInCount={
          can('stock.adjust')
            ? (item, locationId) => {
                setFoundAt(locationId);
                setCountingIn(item);
              }
            : undefined
        }
      />

      {/* An order chosen for the delivery: that line's own Receive dialog,
          as the order's page opens it, over Stock (ADR-093, v3). */}
      {delivery && (
        <ReceiveLineDialog
          key={delivery.line.id}
          orderId={delivery.orderId}
          orderNumber={delivery.number}
          line={delivery.line}
          delivery={delivery}
          locations={leaves}
          tree={locations}
          canSeeLots
          onClose={() => setDelivery(null)}
          onReceived={async (received) => {
            openReceived(received);
            await refresh();
          }}
          onOpenOrder={() =>
            navigate(`/orders/${delivery.orderId}`, { state: OFFER_BACK })
          }
        />
      )}

      {moving && (
        <MoveStockDialog
          mode={moving.mode}
          row={moving.row}
          locations={leaves}
          tree={locations}
          canSeePartners={can('partners.view')}
          onClose={() => setMoving(null)}
          onMoved={refresh}
        />
      )}

      {/* Found stock counted in (ADR-093, R26): Stock reads again, the
          code's row open at the place it was counted into, its lots too. */}
      {countingIn && (
        <CountInDialog
          key={countingIn.variantId}
          item={countingIn}
          locations={leaves}
          tree={locations}
          defaultLocationId={foundAt ?? ''}
          canSeeCosts={can('costs.view')}
          onClose={() => {
            setCountingIn(null);
            setFoundAt(null);
          }}
          onCounted={async (locationId) => {
            // Counted in from Found in a count: no receipt is left to make.
            if (foundAt !== null) closeReceiving();
            setFoundAt(null);
            openRow(openKey(countingIn.variantId, locationId), true);
            await refresh();
          }}
        />
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
