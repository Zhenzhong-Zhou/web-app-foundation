import Tune from '@mui/icons-material/Tune';
import {
  Box,
  Button,
  Drawer,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { WhomToAskRead } from '../account/whom-to-ask';
import type {
  ProductCategoryList,
  ProductCounts,
  ProductPage,
  ProductSummary,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterChips } from '../components/filter-chips';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { PageHeader } from '../components/page-header';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import type { DiscontinuedShown, ItemSort } from '../lib/api-names';
import { HIDDEN } from '../lib/hidden';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import {
  id,
  oneOf,
  useAddressWrite,
  useListFilters,
} from '../lib/use-list-filters';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { type ListSort, useListSort, withSort } from '../lib/use-list-sort';
import { useResource } from '../lib/use-resource';
import { useTab } from '../lib/use-tab';
import { rem } from '../theme/rem';
import { CategoryFilter } from './category-filter';
import { CreateProductDialog } from './create-product-dialog';
import {
  categoryOptions,
  countOf,
  ITEM_SORTS,
  ITEM_TABS,
  itemsShown,
  type ItemTab,
  UNCATEGORISED,
} from './item-list';
import { ItemCards, ItemTable, type Ticks } from './item-rows';
import { ItemTabs } from './item-tabs';
import { itemTabLabel } from './product-types';
import { SeveralAtOnce } from './several-at-once';

/**
 * Products and their variants, generated from the server's OpenAPI document
 * (ADR-068), re-exported here for the files that import them from this page.
 */
export type { Variant, VariantTranslation } from '../api/types.gen';

/** The six types alone, in the tabs' order: which one Items opens on. */
const TYPE_TABS = ITEM_TABS.filter(
  (tab): tab is Exclude<ItemTab, 'all'> => tab !== 'all',
);

/**
 * Items' filters in the address (ADR-091, ADR-092), beside its tab, search
 * and sort: a category's id, which holds those under it, or
 * `uncategorised`; and the discontinued items, hidden unless `only`, the
 * Discontinued chip, or `include`, which the top bar's Show all opens.
 */
const ADDRESS_FILTERS = {
  category: {
    read: (value: string | null) =>
      value === UNCATEGORISED ? value : id.read(value),
    write: id.write,
  },
  discontinued: oneOf<DiscontinuedShown>(['', 'only', 'include'], ''),
};

/** Name, A to Z, unless a header is chosen (ADR-092). */
const BY_NAME: ListSort<ItemSort> = { key: 'name', order: 'asc' };

/**
 * The phone's Sort list (ADR-092): each column's own way first, the stock
 * fewest first, a date newest first.
 */
const PHONE_SORTS = defineMessages({
  'name:asc': { id: 'products.sort.name', defaultMessage: 'Name' },
  'category:asc': { id: 'products.category', defaultMessage: 'Category' },
  'stock:asc': {
    id: 'products.sort.stock',
    defaultMessage: 'In stock, fewest first',
  },
  'changed:desc': {
    id: 'products.sort.changed',
    defaultMessage: 'Last changed, newest first',
  },
  'added:desc': {
    id: 'products.sort.added',
    defaultMessage: 'Date added, newest first',
  },
});

/** Where Add item would be, for a role that cannot add one (ADR-091). */
const NO_ADD = defineMessages({
  ask: {
    id: 'products.add.ask',
    defaultMessage:
      'Your role does not include adding items. To do more, ask {names}.',
  },
  none: {
    id: 'products.add.none',
    defaultMessage: 'Your role does not include adding items.',
  },
});

/**
 * Items (ADR-092): everything the company keeps, by type and category.
 * Tabs for the types with their counts, the search, the category and
 * Discontinued; fifty rows at a time, each with its stock and status;
 * sorted by its headers. Every choice is in the address, so Back from an
 * item, a bookmark or a link lands on the list as it was.
 */
export function ProductsPage() {
  const intl = useIntl();
  const can = useCan();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const write = useAddressWrite();

  /**
   * The last counts read, kept while another tab's or search's first page
   * is on its way, so the tabs stay where they are; each count shows grey
   * until its own answer comes.
   */
  const [known, setKnown] = useState<ProductCounts | null>(null);

  // Products, or the first type the organization holds an item of.
  const opening: ItemTab = known
    ? (TYPE_TABS.find((tab) =>
        known.types.some((entry) => entry.type === tab),
      ) ?? 'good')
    : 'good';
  const [tab, setTab] = useTab<ItemTab>([
    opening,
    ...ITEM_TABS.filter((other) => other !== opening),
  ]);

  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const { category, discontinued } = filters;
  const { text, setText, search } = useListSearch();
  const { sort: chosen, header } = useListSort(ITEM_SORTS, BY_NAME);
  const sort = chosen ?? BY_NAME;

  const query = new URLSearchParams();
  if (tab !== 'all') query.set('type', tab);
  if (category) query.set('category', category);
  if (discontinued) query.set('discontinued', discontinued);
  const filtered = query.toString();
  const path = withSort(
    withSearch(filtered ? `/products?${filtered}` : '/products', search),
    sort,
  );

  const {
    entries: items,
    first,
    error,
    refused,
    failed,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<ProductSummary, ProductPage>(path, { cursor: 'cursor' });
  const counts = first?.counts ?? null;
  if (counts && counts !== known) setKnown(counts);

  const { data: tree, reload: reloadTree } = useResource<ProductCategoryList>(
    '/products/categories',
  );
  const options = tree
    ? categoryOptions(tree.categories, tab, discontinued, category)
    : [];
  const chosenCategory = options.find((option) => option.id === category);

  const [creating, setCreating] = useState(false);
  const [sheet, setSheet] = useState(false);

  // Show 50 more: focus on the first new row once it is there.
  const firstNewRef = useRef<HTMLAnchorElement>(null);
  const [firstNew, setFirstNew] = useState<number | null>(null);
  useEffect(() => {
    if (firstNew !== null && (items?.length ?? 0) > firstNew) {
      firstNewRef.current?.focus();
    }
  }, [firstNew, items?.length]);
  const showMore = () => {
    setFirstNew(items?.length ?? 0);
    void loadMore();
  };
  const newRow =
    firstNew === null ? null : { index: firstNew, ref: firstNewRef };
  // The rows ticked for several at once, by id (ADR-092).
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  // A new list starts with no row to focus, and nothing ticked: another
  // tab, search, filter or sort clears the ticks, so nothing unseen changes.
  const [readFor, setReadFor] = useState(path);
  if (readFor !== path) {
    setReadFor(path);
    setFirstNew(null);
    setTicked(new Set());
  }

  const showPlaceholders = useDelayedFlag(loading);

  /** Each tab's count: this answer's, grey while it is read, "—" failed. */
  const count = (of: ItemTab) =>
    counts ? countOf(counts, of) : failed ? 'failed' : 'loading';

  // The types the organization holds, and the open one; All last.
  const tabs = ITEM_TABS.filter(
    (each) =>
      each === 'all' ||
      each === tab ||
      known?.types.some((entry) => entry.type === each),
  );

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

  const canAdd = can('products.create');
  const total = counts ? countOf(counts, tab) : null;

  // Check boxes for whoever may change items; a Viewer has none (ADR-092).
  const ticks: Ticks | undefined = can('products.update')
    ? {
        ticked,
        onTick: (id, on) =>
          setTicked((was) => {
            const next = new Set(was);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          }),
        onTickAll: (on) =>
          setTicked(new Set(on ? items?.map((item) => item.id) : [])),
      }
    : undefined;
  const filtersOn = (category ? 1 : 0) + (discontinued ? 1 : 0);

  const categoryFilter = (fullWidth: boolean) => (
    <CategoryFilter
      options={options}
      uncategorisedCount={
        tree ? itemsShown(tree.uncategorised, tab, discontinued) : undefined
      }
      value={category && (tree || category === UNCATEGORISED) ? category : ''}
      onChange={(next) => setFilters({ category: next })}
      fullWidth={fullWidth}
    />
  );

  const discontinuedLabel = intl.formatMessage({
    id: 'products.discontinued',
    defaultMessage: 'Discontinued',
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.products',
          defaultMessage: 'Items',
        })}
        subtitle={intl.formatMessage({
          id: 'products.subtitle',
          defaultMessage: 'Everything the company buys, sells, makes and uses',
        })}
        actions={
          <>
            {/* Every row the list's query matches, not the rows loaded
                (ADR-057, ADR-092). */}
            <ExportButton
              path={path.replace('/products', '/products/export')}
            />
            {/* Reference data for recipes, so it hangs off the catalogue
                as well as the menu's records (ADR-091). */}
            {can('product_licences.view') && (
              <Button
                variant="text"
                component={RouterLink}
                to="/licences"
                state={OFFER_BACK}
              >
                {intl.formatMessage({
                  id: 'products.licences',
                  defaultMessage: 'Licences',
                })}
              </Button>
            )}
            {/* Hidden without products.create — display only, since the
                403 is the actual control (ADR-016); one quiet line in its
                place says whom to ask (ADR-091). */}
            {canAdd ? (
              <Button onClick={openDialog(() => setCreating(true))}>
                {intl.formatMessage({
                  id: 'products.add',
                  defaultMessage: 'Add item',
                })}
              </Button>
            ) : (
              <Box sx={{ maxWidth: rem(480) }}>
                <WhomToAskRead {...NO_ADD} />
              </Box>
            )}
          </>
        }
      />

      <ItemTabs tabs={tabs} current={tab} onChoose={setTab} count={count} />

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'products.search',
            defaultMessage: 'Search by name or code',
          }),
          value: text,
          onChange: setText,
        }}
        quick={
          phone
            ? []
            : [
                {
                  id: 'discontinued',
                  label: discontinuedLabel,
                  count: counts?.discontinued,
                  pressed: discontinued === 'only',
                  onToggle: () =>
                    setFilters({
                      discontinued: discontinued === 'only' ? '' : 'only',
                    }),
                },
              ]
        }
      >
        {phone ? (
          <Button
            variant="outlined"
            startIcon={<Tune />}
            onClick={() => setSheet(true)}
          >
            {intl.formatMessage(
              {
                id: 'products.filters',
                defaultMessage:
                  '{count, plural, =0 {Filters} other {Filters · #}}',
              },
              { count: filtersOn },
            )}
          </Button>
        ) : (
          categoryFilter(false)
        )}
      </FilterRow>

      {/* What the list holds that no button shows, each removable: the
          category chosen, and the discontinued items Show all included. */}
      <FilterChips
        chips={[
          category !== '' && {
            id: 'category',
            label:
              category === UNCATEGORISED
                ? intl.formatMessage({
                    id: 'products.category.none',
                    defaultMessage: 'Uncategorised',
                  })
                : (chosenCategory?.path.join(' › ') ??
                  intl.formatMessage({
                    id: 'products.category',
                    defaultMessage: 'Category',
                  })),
            onRemove: () => setFilters({ category: '' }),
          },
          discontinued === 'include' && {
            id: 'discontinued-included',
            label: intl.formatMessage({
              id: 'products.discontinuedIncluded',
              defaultMessage: 'Discontinued included',
            }),
            onRemove: () => setFilters({ discontinued: '' }),
          },
          phone &&
            discontinued === 'only' && {
              id: 'discontinued-only',
              label: discontinuedLabel,
              onRemove: () => setFilters({ discontinued: '' }),
            },
        ]}
      />

      {ticks && (
        <SeveralAtOnce
          ticked={items?.filter((item) => ticked.has(item.id)) ?? []}
          shown={items?.length ?? 0}
          categories={tree?.categories ?? []}
          onTickAll={() => ticks.onTickAll(true)}
          onClear={() => setTicked(new Set())}
          onChanged={() => {
            setTicked(new Set());
            reload();
            void reloadTree();
          }}
        />
      )}

      {loading && (
        <Box role="status" sx={HIDDEN}>
          {intl.formatMessage({
            id: 'products.loading',
            defaultMessage: 'Loading items…',
          })}
        </Box>
      )}

      {/* The list's part alone says it could not be read, with Try again;
          the tabs, the search and the filters stay. */}
      {failed && <ListError error={error} onRetry={reload} />}

      {!failed && (
        <Paper variant="outlined">
          {loading || items?.length ? (
            phone ? (
              loading ? (
                showPlaceholders && (
                  <Stack sx={{ p: 2 }} spacing={1} aria-hidden>
                    <Skeleton height={64} />
                    <Skeleton height={64} />
                  </Stack>
                )
              ) : (
                <ItemCards
                  items={items}
                  ticks={ticks}
                  withType={tab === 'all'}
                  firstNew={newRow}
                />
              )
            ) : (
              <ItemTable
                items={items}
                loading={loading}
                withType={tab === 'all'}
                sort={sort}
                header={header}
                onDate={(key) => write({ sort: key, order: 'desc' })}
                ticks={ticks}
                firstNew={newRow}
              />
            )
          ) : (
            <ItemsEmpty
              search={search}
              filtered={filtersOn > 0}
              uncategorised={category === UNCATEGORISED}
              onShowAll={() => setFilters({ category: '', discontinued: '' })}
              tab={tab}
              counts={counts}
              onTab={setTab}
              onClearSearch={() => setText('')}
              add={
                canAdd && !search && filtersOn === 0 && known?.all === 0 ? (
                  <Button onClick={openDialog(() => setCreating(true))}>
                    {intl.formatMessage({
                      id: 'products.add',
                      defaultMessage: 'Add item',
                    })}
                  </Button>
                ) : undefined
              }
            />
          )}
        </Paper>
      )}

      {/* Show 50 more, and how many of the tab's are shown; failing, the
          rows stay, with a line saying so and Try again. */}
      {!failed && items && (hasMore || error) && (
        <Stack
          direction="row"
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {total !== null && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage(
                {
                  id: 'products.showing',
                  defaultMessage: 'Showing {shown} of {total}',
                },
                { shown: items.length, total },
              )}
            </Typography>
          )}
          {error && (
            <Typography variant="body2" sx={{ color: 'error.main' }}>
              {intl.formatMessage({
                id: 'products.moreFailed',
                defaultMessage: 'The next 50 could not be loaded.',
              })}
            </Typography>
          )}
          <Button variant="text" disabled={loadingMore} onClick={showMore}>
            {loadingMore
              ? intl.formatMessage({
                  id: 'common.loading',
                  defaultMessage: 'Loading…',
                })
              : error
                ? intl.formatMessage({
                    id: 'common.tryAgain',
                    defaultMessage: 'Try again',
                  })
                : intl.formatMessage({
                    id: 'products.showMore',
                    defaultMessage: 'Show 50 more',
                  })}
          </Button>
        </Stack>
      )}

      {/* On a phone the category, the sort and Discontinued rise in a
          sheet from the bottom, scrolling inside so its buttons stay in
          reach (ADR-090, #481). */}
      <Drawer
        anchor="bottom"
        open={sheet}
        onClose={() => setSheet(false)}
        slotProps={{ paper: { sx: { maxHeight: '80vh' } } }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant="h6" component="h2">
            {intl.formatMessage({
              id: 'products.filtersAndSort',
              defaultMessage: 'Filters and sort',
            })}
          </Typography>
          {categoryFilter(true)}
          <TextField
            select
            size="small"
            id="items-sort"
            label={intl.formatMessage({
              id: 'products.sort',
              defaultMessage: 'Sort',
            })}
            // A header's other way, Name Z to A, shows as its column.
            value={
              `${sort.key}:${sort.order}` in PHONE_SORTS
                ? `${sort.key}:${sort.order}`
                : (Object.keys(PHONE_SORTS).find((value) =>
                    value.startsWith(`${sort.key}:`),
                  ) ?? 'name:asc')
            }
            onChange={(event) => {
              const [key, order] = event.target.value.split(':');
              write({ sort: key, order });
            }}
          >
            {Object.entries(PHONE_SORTS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {intl.formatMessage(label)}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButton
            value="discontinued"
            size="small"
            selected={discontinued === 'only'}
            onChange={() =>
              setFilters({
                discontinued: discontinued === 'only' ? '' : 'only',
              })
            }
            sx={{ borderRadius: 999, alignSelf: 'flex-start', gap: 0.75 }}
          >
            {discontinuedLabel}
            {counts && (
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {counts.discontinued}
              </Box>
            )}
          </ToggleButton>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: 'flex-end' }}
          >
            {/* One write: two would each start from the address as it
                was, and the second would put back what the first cleared. */}
            <Button
              variant="text"
              onClick={() =>
                write({
                  category: null,
                  discontinued: null,
                  sort: null,
                  order: null,
                })
              }
            >
              {intl.formatMessage({
                id: 'products.filters.clear',
                defaultMessage: 'Clear',
              })}
            </Button>
            <Button onClick={() => setSheet(false)}>
              {total === null
                ? intl.formatMessage({
                    id: 'products.filters.done',
                    defaultMessage: 'Done',
                  })
                : intl.formatMessage(
                    {
                      id: 'products.filters.show',
                      defaultMessage: 'Show {count}',
                    },
                    { count: total },
                  )}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      {/* Its type from the open tab, none from All (ADR-092); once added,
          the new item's page opens in the list's place. */}
      {creating && (
        <CreateProductDialog
          type={tab === 'all' ? null : tab}
          categories={tree?.categories ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </Stack>
  );
}

/**
 * The list with nothing to show (ADR-092): no items yet, with Add item;
 * a search with no match on this tab, saying where the matches are with
 * a button there; or nothing matching the filters, speaking of a search
 * only when there is one (#306's 34), with Show all items as its way
 * out. Uncategorised emptied by the last item moved says so.
 */
function ItemsEmpty({
  search,
  filtered,
  uncategorised,
  onShowAll,
  tab,
  counts,
  onTab,
  onClearSearch,
  add,
}: {
  search: string;
  filtered: boolean;
  uncategorised: boolean;
  onShowAll: () => void;
  tab: ItemTab;
  counts: ProductCounts | null;
  onTab: (tab: ItemTab) => void;
  onClearSearch: () => void;
  add: ReactNode;
}) {
  const intl = useIntl();
  const elsewhere =
    search && counts
      ? TYPE_TABS.find((other) => other !== tab && countOf(counts, other) > 0)
      : undefined;

  if (search) {
    return (
      <EmptyState
        action={
          <>
            {elsewhere && (
              <Button variant="outlined" onClick={() => onTab(elsewhere)}>
                {intl.formatMessage(
                  {
                    id: 'products.empty.seeIn',
                    defaultMessage: 'See in {tab}',
                  },
                  { tab: itemTabLabel(elsewhere, intl) },
                )}
              </Button>
            )}
            <Button variant="text" onClick={onClearSearch}>
              {intl.formatMessage({
                id: 'products.empty.clearSearch',
                defaultMessage: 'Clear search',
              })}
            </Button>
          </>
        }
      >
        {elsewhere && counts
          ? intl.formatMessage(
              {
                id: 'products.empty.elsewhere',
                defaultMessage:
                  'Nothing in {tab} matches “{search}”. {count, plural, one {# item} other {# items}} in {other} {count, plural, one {matches} other {match}}.',
              },
              {
                tab: itemTabLabel(tab, intl),
                search,
                count: countOf(counts, elsewhere),
                other: itemTabLabel(elsewhere, intl),
              },
            )
          : intl.formatMessage({
              id: 'inventory.noMatch',
              defaultMessage: 'Nothing matches that search.',
            })}
      </EmptyState>
    );
  }

  if (filtered) {
    return (
      <EmptyState
        action={
          <Button variant="outlined" onClick={onShowAll}>
            {intl.formatMessage({
              id: 'products.empty.showAll',
              defaultMessage: 'Show all items',
            })}
          </Button>
        }
      >
        {uncategorised
          ? intl.formatMessage({
              id: 'products.empty.allCategorised',
              defaultMessage: 'Every item has a category.',
            })
          : intl.formatMessage({
              id: 'products.empty.filtered',
              defaultMessage: 'No items match these filters.',
            })}
      </EmptyState>
    );
  }

  return (
    <EmptyState action={add} learnMore={{ guide: 'items', section: 'add' }}>
      {counts?.all === 0 || !counts
        ? intl.formatMessage({
            id: 'products.empty',
            defaultMessage:
              'No items yet. Add what you sell first, or the raw materials you make it from.',
          })
        : intl.formatMessage({
            id: 'products.empty.tab',
            defaultMessage: 'Nothing on this tab yet.',
          })}
    </EmptyState>
  );
}
