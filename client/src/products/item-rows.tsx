import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import Check from '@mui/icons-material/Check';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import {
  Box,
  Checkbox,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { type MouseEvent, type Ref, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type { ProductSummary } from '../api/types.gen';
import { PlaceholderRows } from '../components/placeholder-rows';
import { ProductCover } from '../components/product-cover';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { formatDate, SEPARATOR } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import type { SortOrder } from '../lib/use-list-sort';
import { TOUCH } from '../theme/media';
import { rem } from '../theme/rem';
import { STATUS_TONES } from '../theme/status';
import type { ItemSort } from './item-list';
import { productTypeIcon } from './product-types';
import { displayWithUnit } from './units';

/** The date column's two dates: which it shows follows the sort. */
type DateKey = 'changed' | 'added';

/** What a SortHeader needs for one column (useListSort's `header`). */
type Header = { active: boolean; order: SortOrder; onSort: () => void };

/**
 * The check boxes, for whoever may change items (ADR-092): which rows are
 * ticked, one ticked or not, and the header's, every row loaded or none.
 */
export interface Ticks {
  ticked: ReadonlySet<string>;
  onTick: (id: string, on: boolean) => void;
  onTickAll: (on: boolean) => void;
}

/** A fingertip's box on touch (#170); MUI's own is 42 px. */
const TICK_SX = { [TOUCH]: { width: 44, height: 44 } };

/** A row's check box, named by the item and its code. */
function Tick({ item, ticks }: { item: ProductSummary; ticks: Ticks }) {
  const intl = useIntl();
  return (
    <Checkbox
      checked={ticks.ticked.has(item.id)}
      onChange={(event) => ticks.onTick(item.id, event.target.checked)}
      sx={TICK_SX}
      slotProps={{
        input: {
          'aria-label': intl.formatMessage(
            { id: 'products.tick', defaultMessage: 'Select {name}, {code}' },
            { name: item.displayName, code: item.sku },
          ),
        },
      }}
    />
  );
}

/** A row's code under its name: the code, or how many variants and the first. */
function useCodes() {
  const intl = useIntl();
  return (item: ProductSummary) =>
    intl.formatMessage(
      {
        id: 'products.row.codes',
        defaultMessage:
          '{count, plural, one {{code}} other {# variants · {code}, …}}',
      },
      { count: item.variantCount, code: item.sku },
    );
}

/** A row's category: its path from the top, or Uncategorised. */
function useCategory() {
  const intl = useIntl();
  return (item: ProductSummary) =>
    item.category
      ? item.category.path.join(' › ')
      : intl.formatMessage({
          id: 'products.category.none',
          defaultMessage: 'Uncategorised',
        });
}

/**
 * The stock on hand in its unit, or how many variants where their units
 * differ (ADR-092), never added up here: the server sums it (ADR-025).
 */
function useOnHand() {
  const intl = useIntl();
  return (item: ProductSummary) =>
    item.onHand !== null && item.unitOfMeasure !== null
      ? displayWithUnit(item.onHand, item.unitOfMeasure, intl)
      : intl.formatMessage(
          {
            id: 'products.row.variantsStock',
            defaultMessage:
              '{count, plural, one {# variant} other {# variants}}',
          },
          { count: item.variantCount },
        );
}

/**
 * Low stock or Out in Home's words, tones and icons (ADR-085, ADR-092),
 * beside the number; a discontinued item's row says Discontinued.
 */
function RowStatus({ item }: { item: ProductSummary }) {
  const intl = useIntl();

  if (!item.isActive) {
    return (
      <StatusChip
        tone="neutral"
        label={intl.formatMessage({
          id: 'products.discontinued',
          defaultMessage: 'Discontinued',
        })}
      />
    );
  }
  if (item.stockStatus === 'out') {
    return (
      <StatusChip
        tone={STATUS_TONES.reorder.out}
        icon={<ErrorOutlined />}
        label={intl.formatMessage({
          id: 'inventory.reorder.filter.out',
          defaultMessage: 'Out',
        })}
      />
    );
  }
  if (item.stockStatus === 'low') {
    return (
      <StatusChip
        tone={STATUS_TONES.reorder.low}
        icon={<WarningAmberOutlined />}
        label={intl.formatMessage({
          id: 'inventory.reorder.filter.low',
          defaultMessage: 'Low stock',
        })}
      />
    );
  }
  return null;
}

/** Inventory for the item alone, with Back to Items as it was (ADR-092). */
function stockPath(item: ProductSummary): string {
  return `/inventory?productId=${item.id}`;
}

/**
 * Items' rows from 600 px (ADR-092): the cover or the type's icon; the
 * name in bold, its code in grey; the category; the stock, right
 * aligned, its status under it, a link to Inventory for the item; one
 * date, which the sort decides. The whole row opens the item, its name
 * the link a keyboard reaches; at least 44 px tall on touch.
 *
 * The head stays while the rows are read, a sort's included, so the
 * header pressed keeps its focus (#505's 54).
 *
 * With `ticks`, for whoever may change items, a check box leads each row
 * and the head's ticks every row loaded (ADR-092).
 */
export function ItemTable({
  items,
  loading,
  sort,
  header,
  onDate,
  firstNew,
  ticks,
}: {
  items: ProductSummary[] | null;
  loading: boolean;
  sort: { key: ItemSort; order: SortOrder };
  header: (key: ItemSort) => Header;
  onDate: (key: DateKey) => void;
  /** The first row Show 50 more added, which takes focus. */
  firstNew: { index: number; ref: Ref<HTMLAnchorElement> } | null;
  ticks?: Ticks;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const codes = useCodes();
  const category = useCategory();
  const onHand = useOnHand();
  const dateKey: DateKey = sort.key === 'added' ? 'added' : 'changed';

  // A click anywhere on a row opens the item, but not one on a link, a
  // button or a check box inside it, nor beside the box, which do their own.
  const open = (item: ProductSummary) => (event: MouseEvent) => {
    if ((event.target as Element).closest('a, button, input, [data-tick]')) {
      return;
    }
    void navigate(`/items/${item.id}`);
  };

  const tickedHere = items?.filter((item) => ticks?.ticked.has(item.id));
  const allTicked = !!items?.length && tickedHere?.length === items.length;

  return (
    <TableContainer>
      <Table size="small" aria-busy={loading}>
        <TableHead>
          <TableRow>
            {ticks && (
              <TableCell padding="checkbox">
                <Checkbox
                  disabled={!items?.length}
                  checked={allTicked}
                  indeterminate={!!tickedHere?.length && !allTicked}
                  onChange={() => ticks.onTickAll(!allTicked)}
                  sx={TICK_SX}
                  slotProps={{
                    input: {
                      'aria-label': intl.formatMessage({
                        id: 'products.tickAll',
                        defaultMessage: 'Select every item shown',
                      }),
                    },
                  }}
                />
              </TableCell>
            )}
            <SortHeader
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              {...header('name')}
            />
            <SortHeader
              label={intl.formatMessage({
                id: 'products.category',
                defaultMessage: 'Category',
              })}
              {...header('category')}
            />
            <SortHeader
              align="right"
              label={intl.formatMessage({
                id: 'products.inStock',
                defaultMessage: 'In stock',
              })}
              {...header('stock')}
            />
            <DateHeader
              dateKey={dateKey}
              header={header(dateKey)}
              onDate={onDate}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && <PlaceholderRows columns={ticks ? 5 : 4} />}
          {items?.map((item, index) => (
            <TableRow
              key={item.id}
              hover
              selected={ticks?.ticked.has(item.id)}
              onClick={open(item)}
              sx={{
                cursor: 'pointer',
                '@media (pointer: coarse)': { height: rem(44) },
              }}
            >
              {ticks && (
                <TableCell padding="checkbox" data-tick>
                  <Tick item={item} ticks={ticks} />
                </TableCell>
              )}
              <TableCell>
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: 'center' }}
                >
                  <ProductCover
                    fileId={item.coverFileId}
                    name={item.displayName}
                    icon={productTypeIcon(item.type)}
                  />
                  <Stack sx={{ minWidth: 0 }}>
                    <Link
                      component={RouterLink}
                      to={`/items/${item.id}`}
                      ref={firstNew?.index === index ? firstNew.ref : undefined}
                      underline="hover"
                      color="inherit"
                      sx={{ fontWeight: 600 }}
                    >
                      {item.displayName}
                    </Link>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary' }}
                    >
                      {codes(item)}
                    </Typography>
                  </Stack>
                </Stack>
              </TableCell>
              <TableCell
                sx={item.category ? undefined : { color: 'text.secondary' }}
              >
                {category(item)}
              </TableCell>
              <TableCell align="right">
                <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                  <Link
                    component={RouterLink}
                    to={stockPath(item)}
                    state={OFFER_BACK}
                    aria-label={intl.formatMessage(
                      {
                        id: 'products.row.stockOf',
                        defaultMessage: '{quantity}, stock of {name}',
                      },
                      { quantity: onHand(item), name: item.displayName },
                    )}
                    // A fingertip's height on touch, so a near miss does not
                    // open the item instead (ADR-092).
                    sx={{
                      whiteSpace: 'nowrap',
                      [TOUCH]: {
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: rem(44),
                      },
                    }}
                  >
                    {onHand(item)}
                  </Link>
                  <RowStatus item={item} />
                </Stack>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatDate(
                  dateKey === 'added' ? item.createdAt : item.updatedAt,
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * The one date column (ADR-092): Last changed unless the list is sorted
 * by Date added, its header sorting by the date it shows, and its menu
 * switching to the other, newest first.
 */
function DateHeader({
  dateKey,
  header,
  onDate,
}: {
  dateKey: DateKey;
  header: Header;
  onDate: (key: DateKey) => void;
}) {
  const intl = useIntl();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const label = (key: DateKey) =>
    key === 'added'
      ? intl.formatMessage({
          id: 'products.dateAdded',
          defaultMessage: 'Date added',
        })
      : intl.formatMessage({
          id: 'products.lastChanged',
          defaultMessage: 'Last changed',
        });

  return (
    <TableCell
      sortDirection={header.active ? header.order : false}
      aria-sort={
        header.active
          ? header.order === 'asc'
            ? 'ascending'
            : 'descending'
          : undefined
      }
      sx={{ whiteSpace: 'nowrap' }}
    >
      <TableSortLabel
        active={header.active}
        direction={header.active ? header.order : 'asc'}
        onClick={header.onSort}
      >
        {label(dateKey)}
      </TableSortLabel>
      <IconButton
        size="small"
        aria-label={intl.formatMessage({
          id: 'products.whichDate',
          defaultMessage: 'Which date to show',
        })}
        aria-haspopup="menu"
        onClick={(event) => setMenu(event.currentTarget)}
      >
        <ArrowDropDown fontSize="small" />
      </IconButton>
      <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
        {(['changed', 'added'] as const).map((key) => (
          <MenuItem
            key={key}
            selected={key === dateKey}
            onClick={() => {
              setMenu(null);
              onDate(key);
            }}
          >
            <ListItemIcon>
              {key === dateKey && <Check fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{label(key)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </TableCell>
  );
}

/**
 * Items' rows below 600 px, as cards (ADR-090, ADR-092): the name in
 * bold; its code and category on one line; then the stock and its
 * status. The card is two links side by side, since a link holds no
 * other: the item's, from the cover to the category, and the stock's,
 * which opens Inventory for the item alone, as the wider row's number
 * does.
 *
 * With `ticks`, a check box sits before each card's links, beside them
 * rather than in one, since a link holds no control.
 */
export function ItemCards({
  items,
  loading,
  firstNew,
  ticks,
}: {
  items: ProductSummary[] | null;
  loading: boolean;
  firstNew: { index: number; ref: Ref<HTMLAnchorElement> } | null;
  ticks?: Ticks;
}) {
  const intl = useIntl();
  const codes = useCodes();
  const category = useCategory();
  const onHand = useOnHand();

  return (
    <Stack component="ul" aria-busy={loading} sx={{ m: 0, p: 0 }}>
      {items?.map((item, index) => (
        <Box
          component="li"
          key={item.id}
          sx={{
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            '& + &': { borderTop: 1, borderColor: 'divider' },
            // As a ticked table row is tinted (MUI's selected row).
            ...(ticks?.ticked.has(item.id) && {
              bgcolor: (theme) =>
                alpha(
                  theme.palette.primary.main,
                  theme.palette.action.selectedOpacity,
                ),
            }),
          }}
        >
          {ticks && (
            <Box sx={{ pl: 1 }}>
              <Tick item={item} ticks={ticks} />
            </Box>
          )}
          <Link
            component={RouterLink}
            to={`/items/${item.id}`}
            ref={firstNew?.index === index ? firstNew.ref : undefined}
            underline="none"
            color="inherit"
            sx={{
              display: 'flex',
              flex: 1,
              minWidth: 0,
              gap: 1.5,
              alignItems: 'center',
              p: 2,
              pl: ticks ? 1 : 2,
              minHeight: rem(44),
            }}
          >
            <ProductCover
              fileId={item.coverFileId}
              name={item.displayName}
              icon={productTypeIcon(item.type)}
            />
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>
                {item.displayName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {codes(item)}
                {SEPARATOR}
                {category(item)}
              </Typography>
            </Stack>
          </Link>
          <Link
            component={RouterLink}
            to={stockPath(item)}
            state={OFFER_BACK}
            underline="none"
            aria-label={intl.formatMessage(
              {
                id: 'products.row.stockOf',
                defaultMessage: '{quantity}, stock of {name}',
              },
              { quantity: onHand(item), name: item.displayName },
            )}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 0.5,
              alignSelf: 'stretch',
              py: 2,
              pr: 2,
              pl: 1,
              minHeight: rem(44),
            }}
          >
            {/* The number underlined, a link by more than its colour
                (WCAG 1.4.1); the status under it, as the wider row's. */}
            <Box
              component="span"
              sx={{ whiteSpace: 'nowrap', textDecoration: 'underline' }}
            >
              {onHand(item)}
            </Box>
            <RowStatus item={item} />
          </Link>
        </Box>
      ))}
    </Stack>
  );
}
