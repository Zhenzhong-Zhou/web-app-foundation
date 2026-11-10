import ExpandMore from '@mui/icons-material/ExpandMore';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import {
  Alert,
  Box,
  Button,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { WhomToAskRead } from '../account/whom-to-ask';
import type { ProductCategory, ProductCategoryList } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ListError } from '../components/list-error';
import { PageHeader } from '../components/page-header';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { HIDDEN } from '../lib/hidden';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { rem } from '../theme/rem';
import {
  type CategoryChange,
  CategoryDialog,
  DeleteCategoryDialog,
} from './category-dialogs';
import { categoryTree } from './item-list';

/** Where Add category would be, for a role that cannot change items. */
const NO_CHANGE = defineMessages({
  ask: {
    id: 'categories.add.ask',
    defaultMessage:
      'Your role does not include changing categories. To do more, ask {names}.',
  },
  none: {
    id: 'categories.add.none',
    defaultMessage: 'Your role does not include changing categories.',
  },
});

/** A refusal shown under the row it is about. */
interface Refusal {
  id: string;
  message: string;
}

/**
 * Settings › Categories (ADR-092): the organization's one tree of item
 * categories, each with the items in it and in those under it. Whoever
 * may change items adds, renames, moves and deletes them; a move's list
 * leaves out the category's own branch, and a category still holding
 * items or categories is refused at its row, saying how many and to move
 * them first. Whoever may only see items reads the tree. Items' Manage
 * categories opens it with Back.
 */
export function CategoriesPage() {
  const intl = useIntl();
  const can = useCan();
  const canChange = can('products.update');
  const { data, error, refused, loading, reload } =
    useResource<ProductCategoryList>('/products/categories');
  const categories = data?.categories ?? null;
  const showPlaceholders = useDelayedFlag(loading);

  const [change, setChange] = useState<CategoryChange | null>(null);
  const [deleting, setDeleting] = useState<ProductCategory | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A category deleted takes its row and its Actions with it: once the
  // tree without it is on screen, and the dialog has let focus go, the
  // page begins again at its heading, as Members does.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    heading.current?.focus();
  }, [categories]);

  if (refused) {
    return (
      <RevisionRefusalPage failure={refused} onRetry={() => void reload()} />
    );
  }

  /**
   * Delete asks first when the tree shows nothing in it; else it is
   * refused at once, at its row, saying what to move, with no request:
   * asking first for what would be refused is a question with no answer.
   */
  /** Rename's or Move's dialog for a category, from its row's menu. */
  const openChange =
    (kind: 'rename' | 'move') =>
    (category: ProductCategory, opener: HTMLElement) => {
      setRefusal(null);
      openDialog(() => setChange({ kind, category }))({
        currentTarget: opener,
      });
    };

  function askToDelete(category: ProductCategory, opener: HTMLElement) {
    setRefusal(null);
    const items = category.items.reduce(
      (sum, entry) => sum + entry.active + entry.discontinued,
      0,
    );
    const inside =
      categories?.filter((each) => each.parentId === category.id).length ?? 0;
    if (items === 0 && inside === 0) {
      openDialog(() => setDeleting(category))({ currentTarget: opener });
      return;
    }
    setRefusal({
      id: category.id,
      message: intl.formatMessage(
        {
          id: 'categories.delete.holds',
          defaultMessage:
            '{name} still holds {what}. Move what is in it to another category first, then delete {name}.',
        },
        {
          name: category.name,
          what: intl.formatList(
            [
              items > 0 &&
                intl.formatMessage(
                  {
                    id: 'categories.delete.items',
                    defaultMessage:
                      '{count, plural, one {# item} other {# items}}',
                  },
                  { count: items },
                ),
              inside > 0 &&
                intl.formatMessage(
                  {
                    id: 'categories.delete.categories',
                    defaultMessage:
                      '{count, plural, one {# category} other {# categories}}',
                  },
                  { count: inside },
                ),
            ].filter((part): part is string => part !== false),
          ),
        },
      ),
    });
  }

  const add = (
    <Button
      onClick={openDialog(() => {
        setRefusal(null);
        setChange({ kind: 'add' });
      })}
    >
      {intl.formatMessage({
        id: 'categories.add',
        defaultMessage: 'Add category',
      })}
    </Button>
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        headingRef={heading}
        title={intl.formatMessage({
          id: 'layout.menu.categories',
          defaultMessage: 'Categories',
        })}
        subtitle={intl.formatMessage({
          id: 'categories.intro',
          defaultMessage:
            'Group items to find them by category on Items. An item is in one category, or none.',
        })}
        actions={
          canChange ? (
            add
          ) : (
            <Box sx={{ maxWidth: rem(480) }}>
              <WhomToAskRead {...NO_CHANGE} />
            </Box>
          )
        }
      />

      {loading && (
        <Box role="status" sx={HIDDEN}>
          {intl.formatMessage({
            id: 'categories.loading',
            defaultMessage: 'Loading categories…',
          })}
        </Box>
      )}

      {/* A read again that failed keeps the tree shown, with the words
          above it; a first read that failed has the tree's place alone. */}
      {categories && error && <Alert severity="error">{error}</Alert>}

      {!categories && error ? (
        <ListError error={error} onRetry={() => void reload()} />
      ) : (
        <Paper variant="outlined">
          {!categories ? (
            showPlaceholders && (
              <Stack sx={{ p: 2 }} spacing={1} aria-hidden>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </Stack>
            )
          ) : categories.length === 0 ? (
            <EmptyState action={canChange ? add : undefined}>
              {canChange
                ? intl.formatMessage({
                    id: 'categories.empty',
                    defaultMessage:
                      'No categories yet. Add the first, such as Vitamins or Bottles, then put items in it on Items.',
                  })
                : intl.formatMessage({
                    id: 'categories.emptyRead',
                    defaultMessage: 'No categories yet.',
                  })}
            </EmptyState>
          ) : (
            <CategoryTree
              categories={categories}
              refusal={refusal}
              onRefusalClose={() => setRefusal(null)}
              actions={
                canChange
                  ? {
                      onRename: openChange('rename'),
                      onMove: openChange('move'),
                      onDelete: askToDelete,
                    }
                  : undefined
              }
            />
          )}
        </Paper>
      )}

      {change && (
        <CategoryDialog
          change={change}
          categories={categories ?? []}
          onClose={() => setChange(null)}
          onSaved={async () => {
            setChange(null);
            await reload();
          }}
        />
      )}

      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            refocus.current = true;
            await reload();
          }}
          onRefused={(message) => {
            // Something was put in it since the tree was read: refused at
            // its row, as one the tree knew of, with the tree read again.
            setDeleting(null);
            setRefusal({ id: deleting.id, message });
            void reload();
          }}
        />
      )}
    </Stack>
  );
}

interface RowActions {
  onRename: (category: ProductCategory, opener: HTMLElement) => void;
  onMove: (category: ProductCategory, opener: HTMLElement) => void;
  onDelete: (category: ProductCategory, opener: HTMLElement) => void;
}

/**
 * The tree as nested lists, so a screen reader says how deep each is:
 * each category's folder, name and items, those under it counted too,
 * and its Actions for whoever may change them.
 */
function CategoryTree({
  categories,
  refusal,
  onRefusalClose,
  actions,
}: {
  categories: readonly ProductCategory[];
  refusal: Refusal | null;
  onRefusalClose: () => void;
  actions?: RowActions;
}) {
  const intl = useIntl();
  const [menu, setMenu] = useState<{
    anchor: HTMLElement;
    category: ProductCategory;
  } | null>(null);

  // Every item, the discontinued too, in each category and those under it.
  const counts = new Map(
    categoryTree(categories, 'all', 'include').map((option) => [
      option.id,
      option.count,
    ]),
  );
  const ids = new Set(categories.map((category) => category.id));
  const childrenOf = (parentId: string | null) =>
    categories.filter((category) =>
      parentId === null
        ? category.parentId === null || !ids.has(category.parentId)
        : category.parentId === parentId,
    );

  const branch = (parentId: string | null, depth: number) => (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {childrenOf(parentId).map((category) => (
        <Box component="li" key={category.id}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              minHeight: rem(52),
              py: 0.5,
              pl: 2 + depth * 3,
              pr: 1,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <FolderOutlined
              aria-hidden
              fontSize="small"
              sx={{ color: 'text.secondary' }}
            />
            <Stack
              direction="row"
              useFlexGap
              sx={{
                flex: 1,
                minWidth: 0,
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: 1,
              }}
            >
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {category.name}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {intl.formatMessage(
                  {
                    id: 'categories.items',
                    defaultMessage:
                      '{count, plural, =0 {No items} one {# item} other {# items}}',
                  },
                  { count: counts.get(category.id) ?? 0 },
                )}
              </Typography>
            </Stack>
            {actions && (
              <Button
                variant="outlined"
                endIcon={<ExpandMore />}
                aria-haspopup="menu"
                aria-expanded={menu?.category.id === category.id}
                aria-label={intl.formatMessage(
                  {
                    id: 'categories.actionsFor',
                    defaultMessage: 'Actions for {name}',
                  },
                  { name: category.name },
                )}
                onClick={(event) =>
                  setMenu({ anchor: event.currentTarget, category })
                }
              >
                {intl.formatMessage({
                  id: 'common.actions',
                  defaultMessage: 'Actions',
                })}
              </Button>
            )}
          </Stack>
          {refusal?.id === category.id && (
            <Alert
              severity="info"
              onClose={onRefusalClose}
              sx={{ ml: 2 + depth * 3, mr: 1, mb: 1 }}
            >
              {refusal.message}
            </Alert>
          )}
          {branch(category.id, depth + 1)}
        </Box>
      ))}
    </Box>
  );

  return (
    // The first row's line is the panel's edge.
    <Box sx={{ '& > ul > li:first-of-type > div': { borderTop: 0 } }}>
      {branch(null, 0)}
      {actions && menu && (
        <Menu open anchorEl={menu.anchor} onClose={() => setMenu(null)}>
          <MenuItem
            onClick={() => {
              setMenu(null);
              actions.onRename(menu.category, menu.anchor);
            }}
          >
            {intl.formatMessage({
              id: 'categories.rename',
              defaultMessage: 'Rename',
            })}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenu(null);
              actions.onMove(menu.category, menu.anchor);
            }}
          >
            {intl.formatMessage({
              id: 'categories.move',
              defaultMessage: 'Move',
            })}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenu(null);
              actions.onDelete(menu.category, menu.anchor);
            }}
          >
            {intl.formatMessage({
              id: 'categories.delete',
              defaultMessage: 'Delete',
            })}
          </MenuItem>
        </Menu>
      )}
    </Box>
  );
}
