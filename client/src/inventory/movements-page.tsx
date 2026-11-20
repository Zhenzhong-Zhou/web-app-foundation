import {
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';

import { WhomToAskRead } from '../account/whom-to-ask';
import type {
  LotTrace,
  Movement,
  MovementPage,
  OrderDetail,
  VariantOption,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterChips } from '../components/filter-chips';
import { FilterRow } from '../components/filter-row';
import { FiltersButton } from '../components/filters-button';
import { ListError } from '../components/list-error';
import { ListTable } from '../components/list-table';
import { LoadMoreButton } from '../components/load-more-button';
import { NAME_COLUMN } from '../components/name-column';
import { PageHeader } from '../components/page-header';
import { PlaceholderRows } from '../components/placeholder-rows';
import { SelectField } from '../components/select-field';
import { SortHeader } from '../components/sort-header';
import { TableOrCards } from '../components/table-or-cards';
import { VariantPicker } from '../components/variant-picker';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { withQuery } from '../lib/api';
import { withInstants } from '../lib/date-range';
import { formatDay, itemName, nameAndCode } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { organizationToday } from '../lib/time-zone';
import { useCards } from '../lib/use-cards';
import { useKeysetList } from '../lib/use-keyset-list';
import {
  day,
  dayRangeProps,
  id,
  oneOf,
  useAddressWrite,
  useListFilters,
} from '../lib/use-list-filters';
import {
  type ListSort,
  type SortOrder,
  useListSort,
} from '../lib/use-list-sort';
import { useLocations } from '../lib/use-locations';
import { useResource } from '../lib/use-resource';
import { useRowReturn } from '../lib/use-row-return';
import { useVariants } from '../lib/use-variants';
import { leavesOf } from '../locations/tree';
import { NO_RECEIVE } from '../products/receive-line';
import { displayWithUnit } from '../products/units';
import { rem } from '../theme/rem';
import { TYPE } from '../theme/tokens';
import { type MovementColumns, movementHeadCount } from './describe-movement';
import {
  MovementCard,
  MovementCells,
  MovementHeads,
  MovementItem,
  MovementWhen,
} from './movement-cells';
import {
  MOVEMENT_HEADINGS,
  MOVEMENT_REASONS,
  reasonLabel,
} from './movement-reasons';
import { PlaceFilter } from './place-filter';

const PAGE_SIZE = 25;

/**
 * Movements' state in the address (ADR-093, R10; 95a), each filter by the
 * name the API takes and an id, never a code, since a code can change:
 * the item, the place, the lot, the order, the reason, and the When
 * range's first and last day, both included, in the organization's days.
 * `sort` and `order` are the sort's (useListSort).
 */
const ADDRESS_FILTERS = {
  variantId: id,
  locationId: id,
  lotId: id,
  orderId: id,
  reason: oneOf<(typeof MOVEMENT_REASONS)[number] | ''>(
    ['', ...MOVEMENT_REASONS],
    '',
  ),
  from: day,
  until: day,
};

/** Newest first, the log's own order; When pressed, oldest first. */
const NEWEST: ListSort<'when'> = { key: 'when', order: 'desc' };

/**
 * Everything that has moved, newest first (ADR-093, R9 to R14, R21, R24,
 * R34): a log, filtered in the address, that reads as a stock card for
 * one code, In, Out and the balance after each row, with a date range's
 * Opening, In, Out and Closing above it.
 *
 * Gated on stock.view and nothing narrower: each part beyond the ledger
 * comes only as its reader may see it, the places with locations.view
 * and each document with orders.view or production.view, which the
 * server decides (96a, 55a).
 */
export function MovementsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { key: entry } = useLocation();
  const can = useCan();
  const phone = useCards();
  const seesPlaces = can('locations.view');
  const seesOrders = can('orders.view');
  // Silent if it fails: the filter degrades to an empty picker, and the
  // table below is the point of the page.
  const { variants, answered: variantsAnswered } = useVariants(true);
  const { locations, answered, failure } = useLocations(seesPlaces);
  // Stock sits only at leaves (ADR-024), retired ones keeping their
  // history, so nothing else can be a row's place.
  const leaves = leavesOf(locations);

  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const writeAddress = useAddressWrite();
  const { variantId, lotId, reason } = filters;
  // A filter the reader cannot use is ignored, as Stock's address is
  // (stock-tab.tsx; ADR-093, 95a and 96a): a place without
  // locations.view, or one no stock can sit at once the places are
  // read, reads Everywhere; an order without orders.view, which the
  // server would refuse, every movement, with no chip.
  const locationId =
    seesPlaces &&
    (!answered ||
      failure !== null ||
      leaves.some((location) => location.id === filters.locationId))
      ? filters.locationId
      : '';
  const place = leaves.find((location) => location.id === locationId) ?? null;
  const orderId = seesOrders ? filters.orderId : '';
  const range = dayRangeProps(filters, setFilters, {
    from: 'from',
    to: 'until',
  });
  const { sort, header, set: setSort } = useListSort(['when'], NEWEST);
  const oldestFirst = sort?.order === 'asc';

  // As the server's cardOf reads the same filters (movement-view.ts):
  // one code, a variant or its lot, is a stock card; a reason or an
  // order keeps In and Out alone (91a, R24); several items, the change.
  const oneCode = !!variantId || !!lotId;
  const columns: MovementColumns = {
    figures:
      oneCode && !reason && !orderId
        ? 'balance'
        : oneCode || orderId
          ? 'inOut'
          : 'change',
    places: seesPlaces,
  };

  const query = {
    variantId: variantId || undefined,
    locationId: locationId || undefined,
    lotId: lotId || undefined,
    orderId: orderId || undefined,
    reason: reason || undefined,
  };
  /**
   * Read again when a filter changes, never filtered in memory: the list
   * is paged, so an in-memory filter would narrow the page in hand alone
   * and quietly hide everything past it. When as the reader's days in
   * the organization's (ADR-057, ADR-072).
   */
  const list = useKeysetList<Movement, MovementPage>(
    withInstants(
      withQuery('/stock/movements', {
        limit: String(PAGE_SIZE),
        ...query,
        order: oldestFirst ? 'asc' : undefined,
      }),
      range.value,
    ),
    // The rows shown kept for Back, which reads them again (#473).
    { keep: entry },
  );
  const { rowReturn } = useRowReturn();
  const rows = list.entries;
  const period = list.first?.period ?? null;

  // The chips' names, from the rows; the lot's and the order's own read
  // when none is listed, as Stock names its item (ADR-093, R24; review
  // 31): the lot's from its trace, which stock.view reads as Movements.
  const listedLot =
    rows?.find((row) => row.lotId === lotId && row.lotCode)?.lotCode ?? null;
  const readLot =
    useResource<LotTrace>(
      lotId && rows?.length === 0 ? `/stock/lots/${lotId}/trace` : null,
    ).data?.lot.code ?? null;
  const lotCode = listedLot ?? readLot;
  const listedOrder =
    rows?.find((row) => row.document?.id === orderId)?.document?.number ?? null;
  const readOrder =
    useResource<OrderDetail>(
      orderId && rows?.length === 0 ? `/orders/${orderId}` : null,
    ).data?.number ?? null;
  const orderNumber = listedOrder ?? readOrder;
  // A code the picker does not list, an archived one opened from Where
  // it stands, named from its rows (review 32), and kept while a filter
  // added after leaves none to name it.
  const fromRows = variants.some((each) => each.id === variantId)
    ? undefined
    : rows?.find((row) => row.variantId === variantId);
  const [named, setNamed] = useState<VariantOption | null>(null);
  if (fromRows && named?.id !== fromRows.variantId) {
    setNamed({
      id: fromRows.variantId,
      sku: fromRows.currentSku,
      productName: fromRows.productName,
      variantName: fromRows.variantName,
      type: fromRows.type,
      unitOfMeasure: fromRows.unitOfMeasure,
      tracksLots: fromRows.lotId !== null,
    });
  }
  const unlisted = variantId && named?.id === variantId ? named : null;
  const variant =
    variants.find((each) => each.id === variantId) ?? unlisted ?? null;
  const unit = variant?.unitOfMeasure ?? rows?.[0]?.unitOfMeasure ?? null;

  const anyFilter =
    !!variantId ||
    !!locationId ||
    !!lotId ||
    !!orderId ||
    !!reason ||
    !!filters.from ||
    !!filters.until;
  // Every filter and chip in one write (#636), a link's ignored ones too;
  // the sort stays.
  const showAll = () =>
    writeAddress({
      variantId: null,
      locationId: null,
      lotId: null,
      orderId: null,
      reason: null,
      from: null,
      until: null,
    } satisfies Record<keyof typeof ADDRESS_FILTERS, null>);
  // A phone's Filters sheet clears its own fields alone (review 48): the
  // lot's and the order's chips sit outside it, each with its ×.
  const clearSheet = () =>
    writeAddress({
      variantId: null,
      locationId: null,
      reason: null,
      from: null,
      until: null,
    });

  if (list.refused) {
    return <RevisionRefusalPage failure={list.refused} onRetry={list.reload} />;
  }

  const words = {
    item: intl.formatMessage(MOVEMENT_HEADINGS.item),
    when: intl.formatMessage(MOVEMENT_HEADINGS.when),
    reason: intl.formatMessage(MOVEMENT_HEADINGS.reason),
    showAll: intl.formatMessage({
      id: 'inventory.movements.showAll',
      defaultMessage: 'Show all movements',
    }),
  };

  // A code chosen leaves its lot behind: another item has none of its
  // lots.
  const itemFilter = (
    <Box sx={{ flex: `1 1 ${rem(260)}`, minWidth: rem(220) }}>
      <VariantPicker
        id="movements-item"
        label={words.item}
        options={unlisted ? [...variants, unlisted] : variants}
        loading={!variantsAnswered}
        value={variantId}
        onChange={(next) =>
          setFilters(next === variantId ? {} : { variantId: next, lotId: '' })
        }
      />
    </Box>
  );

  // Only places stock can sit in, grouped by their warehouse (20a), as
  // Stock's Location; hidden without locations.view (ADR-080).
  const placeFilter = seesPlaces && (
    <PlaceFilter
      id="movements-place"
      locations={locations}
      leaves={leaves}
      value={answered ? locationId : ''}
      onChange={(next) => setFilters({ locationId: next })}
    />
  );

  const reasonFilter = (
    <SelectField
      id="movements-reason"
      size="small"
      label={words.reason}
      emptyLabel={intl.formatMessage({
        id: 'inventory.movements.anyReason',
        defaultMessage: 'Any reason',
      })}
      value={reason}
      onChange={(event) =>
        setFilters({
          reason: event.target.value as (typeof MOVEMENT_REASONS)[number],
        })
      }
      sx={{ minWidth: rem(180) }}
    >
      {MOVEMENT_REASONS.map((value) => (
        <MenuItem
          key={value}
          value={value}
          sx={{ '&::first-letter': { textTransform: 'uppercase' } }}
        >
          {reasonLabel(value, intl)}
        </MenuItem>
      ))}
    </SelectField>
  );

  const whenFilter = <DateRangeFilter label={words.when} {...range} />;

  // The sort a phone has no header for, in the sheet (#481).
  const sortField = (
    <TextField
      select
      size="small"
      id="movements-sort"
      label={intl.formatMessage({
        id: 'products.sort',
        defaultMessage: 'Sort',
      })}
      value={oldestFirst ? 'asc' : 'desc'}
      onChange={(event) => setSort('when', event.target.value as SortOrder)}
    >
      {(['desc', 'asc'] as const).map((order) => (
        <MenuItem key={order} value={order}>
          {intl.formatMessage(
            {
              id: 'inventory.movements.sort',
              defaultMessage:
                '{order, select, asc {Oldest first} other {Newest first}}',
            },
            { order },
          )}
        </MenuItem>
      ))}
    </TextField>
  );

  // What no result names: each filter on, by its name (ADR-093's
  // states), the days in words, an open range by its one end (review
  // 49).
  const filtersOn = [
    variant && itemName(variant.productName, variant.variantName),
    place && nameAndCode(place.name, place.code),
    lotId && lotCode,
    orderId && orderNumber,
    reason && reasonLabel(reason, intl),
    (filters.from || filters.until) &&
      intl.formatMessage(
        {
          id: 'inventory.movements.days',
          defaultMessage:
            '{from, select, none {until {until}} other {{until, select, none {from {from}} other {{from} – {until}}}}}',
        },
        {
          from: filters.from ? formatDay(filters.from) : 'none',
          until: filters.until ? formatDay(filters.until) : 'none',
        },
      ),
  ].filter((name): name is string => !!name);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.movements',
          defaultMessage: 'Movements',
        })}
        subtitle={intl.formatMessage({
          id: 'inventory.movements.intro',
          defaultMessage:
            'Every quantity change, newest first. Movements are never edited or removed — a mistake is corrected by another movement.',
        })}
        actions={
          // The rows the filters match, the screen's columns, oldest
          // first (87a).
          <ExportButton
            path={withInstants(
              withQuery('/stock/movements/export', query),
              range.value,
            )}
          />
        }
      />

      {/* The filters in one row; on a phone, behind one Filters button
          with the sort (#481). */}
      <FilterRow>
        {phone ? (
          <FiltersButton
            on={
              [
                variantId,
                locationId,
                reason,
                filters.from || filters.until,
              ].filter(Boolean).length
            }
            shown={null}
            onClear={clearSheet}
          >
            {itemFilter}
            {placeFilter}
            {reasonFilter}
            {whenFilter}
            {sortField}
          </FiltersButton>
        ) : (
          <>
            {itemFilter}
            {placeFilter}
            {reasonFilter}
            {whenFilter}
          </>
        )}
        {anyFilter && (
          <Button variant="text" onClick={showAll}>
            {words.showAll}
          </Button>
        )}
      </FilterRow>

      {/* What a way in narrowed that no field shows, each removable:
          a lot's, an order's (R24). */}
      <FilterChips
        chips={[
          lotId !== '' && {
            id: 'lot',
            label: intl.formatMessage(
              {
                id: 'inventory.movements.lotChip',
                defaultMessage: 'Lot: {code}',
              },
              { code: lotCode ?? '…' },
            ),
            onRemove: () => setFilters({ lotId: '' }),
          },
          orderId !== '' && {
            id: 'order',
            label: intl.formatMessage(
              {
                id: 'inventory.movements.orderChip',
                defaultMessage: 'Order: {number}',
              },
              { number: orderNumber ?? '…' },
            ),
            onRemove: () => setFilters({ orderId: '' }),
          },
        ]}
      />

      <CardLines
        oneCode={oneCode}
        place={place ? nameAndCode(place.name, place.code) : null}
        reason={!!reason}
        hint={!oneCode && (!!locationId || !!orderId)}
        onClearReason={() => setFilters({ reason: '' })}
      />

      {period && unit && (
        <Period
          opening={filters.from ? period.opening : null}
          from={filters.from ?? null}
          quantityIn={period.quantityIn}
          quantityOut={period.quantityOut}
          closing={period.closing}
          until={filters.until ?? organizationToday()}
          unit={unit}
        />
      )}

      {/* The list's part alone says it could not be read, with Try
          again; the filters stay. */}
      {list.failed && <ListError error={list.error} onRetry={list.reload} />}

      {!list.failed && (
        <Paper variant="outlined">
          {list.loading || rows?.length ? (
            <TableOrCards
              loading={list.loading}
              table={
                <ListTable
                  label={intl.formatMessage({
                    id: 'layout.nav.movements',
                    defaultMessage: 'Movements',
                  })}
                  size="small"
                >
                  <TableHead>
                    <TableRow>
                      <SortHeader
                        label={words.when}
                        {...header('when')}
                        atRest
                      />
                      {/* With one code, the Item field says which, and
                          When stays pinned (81a). */}
                      {!oneCode && (
                        <TableCell {...NAME_COLUMN}>{words.item}</TableCell>
                      )}
                      <MovementHeads columns={columns} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {list.loading && (
                      <PlaceholderRows
                        columns={movementHeadCount(columns) + (oneCode ? 1 : 2)}
                      />
                    )}
                    {rows?.map((movement) => (
                      <TableRow
                        key={movement.id}
                        hover
                        {...rowReturn(movement.id)}
                      >
                        <TableCell>
                          <MovementWhen movement={movement} />
                        </TableCell>
                        {!oneCode && (
                          <TableCell>
                            <MovementItem movement={movement} />
                          </TableCell>
                        )}
                        <MovementCells movement={movement} columns={columns} />
                      </TableRow>
                    ))}
                  </TableBody>
                </ListTable>
              }
              cards={
                <Stack component="ul" sx={{ m: 0, p: 0 }}>
                  {rows?.map((movement) => (
                    <MovementCard
                      key={movement.id}
                      movement={movement}
                      columns={columns}
                      oneCode={oneCode}
                      back={rowReturn(movement.id)}
                    />
                  ))}
                </Stack>
              }
            />
          ) : (
            <EmptyState
              action={
                anyFilter ? (
                  <Button variant="text" onClick={showAll}>
                    {words.showAll}
                  </Button>
                ) : can('stock.move') ? (
                  <Button
                    onClick={() =>
                      void navigate('/inventory?receive', {
                        state: OFFER_BACK,
                      })
                    }
                  >
                    {intl.formatMessage({
                      id: 'inventory.receive',
                      defaultMessage: 'Receive stock',
                    })}
                  </Button>
                ) : (
                  // Where Receive stock would be, who can and whom to ask
                  // (ADR-093's states; ADR-079).
                  <WhomToAskRead {...NO_RECEIVE} />
                )
              }
            >
              {anyFilter
                ? intl.formatMessage(
                    {
                      id: 'inventory.movements.noneMatch',
                      defaultMessage: 'No movements match: {filters}.',
                    },
                    { filters: intl.formatList(filtersOn) },
                  )
                : intl.formatMessage({
                    id: 'inventory.movements.empty',
                    defaultMessage:
                      'Nothing has moved yet. Receiving stock is what puts the first row here.',
                  })}
            </EmptyState>
          )}
        </Paper>
      )}

      {/* A failed next 25 keeps the rows above, with Try again (#544);
          no total, which only Items, Stock and Reorder know (P1a). */}
      {!list.failed && rows && (
        <LoadMoreButton
          hasMore={list.hasMore}
          loading={list.loadingMore}
          failed={!!list.error}
          pageSize={PAGE_SIZE}
          onLoadMore={list.loadMore}
        />
      )}
    </Stack>
  );
}

/**
 * The lines above a stock card (ADR-093, 85a and 91a): with one code at
 * a place, that In, Out and Balance count it alone; with a reason, why
 * Balance has gone, with Clear Reason; and, while several items are
 * listed at a place or for an order, to choose one.
 */
function CardLines({
  oneCode,
  place,
  reason,
  hint,
  onClearReason,
}: {
  oneCode: boolean;
  place: string | null;
  reason: boolean;
  hint: boolean;
  onClearReason: () => void;
}) {
  const intl = useIntl();

  return (
    <>
      {oneCode && place && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.movements.placeAlone',
              defaultMessage: 'In, Out and Balance count {place} alone.',
            },
            { place },
          )}
        </Typography>
      )}
      {oneCode && reason && (
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage({
              id: 'inventory.movements.reasonHint',
              defaultMessage:
                'Balance counts every reason. Clear Reason to see it.',
            })}
          </Typography>
          <Button variant="text" onClick={onClearReason}>
            {intl.formatMessage({
              id: 'inventory.movements.clearReason',
              defaultMessage: 'Clear Reason',
            })}
          </Button>
        </Stack>
      )}
      {hint && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'inventory.movements.chooseItem',
            defaultMessage: 'Choose one item to see In, Out and Balance.',
          })}
        </Typography>
      )}
    </>
  );
}

/**
 * A date range's stock card for one code, above its table (88a):
 * Opening, In, Out and Closing, Closing the Opening plus In less Out;
 * with a reason chosen, In and Out alone (91a). From the server, never
 * summed here (ADR-055).
 */
function Period({
  opening,
  from,
  quantityIn,
  quantityOut,
  closing,
  until,
  unit,
}: {
  opening: string | null;
  from: string | null;
  quantityIn: string;
  quantityOut: string;
  closing: string | null;
  until: string;
  unit: string;
}) {
  const intl = useIntl();
  const figures = [
    opening !== null &&
      from && {
        label: intl.formatMessage(
          {
            id: 'inventory.movements.openingOn',
            defaultMessage: 'Opening, {day}',
          },
          { day: formatDay(from) },
        ),
        value: opening,
      },
    { label: intl.formatMessage(MOVEMENT_HEADINGS.in), value: quantityIn },
    { label: intl.formatMessage(MOVEMENT_HEADINGS.out), value: quantityOut },
    closing !== null && {
      label: intl.formatMessage(
        {
          id: 'inventory.movements.closingOn',
          defaultMessage: 'Closing, {day}',
        },
        { day: formatDay(until) },
      ),
      value: closing,
    },
  ].filter((figure) => !!figure);

  return (
    <Stack
      component="dl"
      direction="row"
      useFlexGap
      sx={{ m: 0, flexWrap: 'wrap', columnGap: 4, rowGap: 1 }}
    >
      {figures.map((figure) => (
        <Box key={figure.label}>
          <Typography component="dt" sx={{ color: 'text.secondary' }}>
            {figure.label}
          </Typography>
          <Box
            component="dd"
            sx={{
              m: 0,
              fontSize: rem(TYPE.figure),
              lineHeight: 40 / TYPE.figure,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {displayWithUnit(figure.value, unit, intl)}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
