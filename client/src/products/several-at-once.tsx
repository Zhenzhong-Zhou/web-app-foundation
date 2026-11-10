import FolderOutlined from '@mui/icons-material/FolderOutlined';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  ProductCategory,
  ProductChange,
  ProductChanges,
  ProductSummary,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { UndoSnackbar } from '../components/undo-snackbar';
import { api } from '../lib/api';
import { HIDDEN } from '../lib/hidden';
import { openDialog } from '../lib/open-dialog';
import { useSubmit } from '../lib/use-submit';
import { CategorySelect } from './category-select';
import { MAX_AT_ONCE, NOT_CHOSEN } from './item-list';

/**
 * How long a change's message offers Undo (ADR-092), while neither focus
 * nor the pointer is on it, which holds it (WCAG 2.2.1).
 */
const UNDO_MS = 10_000;

/** A change just made: what its message says, and the values before. */
interface Changed {
  key: number;
  message: string;
  changes: ProductChange[];
}

/** Several items changed in one request, its answer the values before. */
function changeMany(items: ProductChange[]): Promise<ProductChanges> {
  return api<ProductChanges>('/products', {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
}

/**
 * Items' several at once (ADR-092), for whoever may change items: the bar
 * over the ticked rows, with how many, Set category, Discontinue and
 * Clear; Set category's dialog; and the message after either, offering
 * Undo, which sends the values before back. Neither asks first, since
 * both can be undone (the design language's Actions that cannot be
 * undone).
 *
 * `onChanged` runs after a change or its Undo: the page clears the ticks
 * and reads the list and the categories again.
 *
 * Below 600 px, where the cards have no head to tick them all, the bar
 * offers Select all while some loaded are not ticked; `shown` is how many
 * are loaded, and `onTickAll` ticks them.
 */
export function SeveralAtOnce({
  ticked,
  shown,
  categories,
  onTickAll,
  onClear,
  onChanged,
}: {
  ticked: ProductSummary[];
  shown: number;
  categories: readonly ProductCategory[];
  onTickAll: () => void;
  onClear: () => void;
  onChanged: () => void;
}) {
  const intl = useIntl();
  const [moving, setMoving] = useState(false);
  const [changed, setChanged] = useState<Changed | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  const undoing = useSubmit<ProductChanges>(() => onChanged(), {
    success: (result) =>
      intl.formatMessage(
        {
          id: 'products.bulk.undone',
          defaultMessage:
            '{count, plural, one {# item is} other {# items are}} back as before.',
        },
        { count: result.items.length },
      ),
  });

  /** A change made: its message, with Undo, and the list read again. */
  function done(message: string, changes: ProductChange[]) {
    undoing.reset();
    setChanged({ key: Date.now(), message, changes });
    onChanged();
  }

  const discontinuing = useSubmit<ProductChanges>((result) =>
    done(
      intl.formatMessage(
        {
          id: 'products.bulk.discontinued',
          defaultMessage:
            'Discontinued {count, plural, one {# item} other {# items}}.',
        },
        { count: result.items.length },
      ),
      result.items,
    ),
  );

  // The bar went with the ticks, and focus with its button: it goes to
  // Undo, the one thing left to do about the change, and holds the message
  // while it is there.
  useEffect(() => {
    if (changed) undoButton.current?.focus();
  }, [changed]);

  // A refusal of Discontinue belongs to the ticks it was for, and goes
  // with them; Undo's stays until the next change.
  const [hadTicks, setHadTicks] = useState(ticked.length > 0);
  if (hadTicks !== ticked.length > 0) {
    setHadTicks(ticked.length > 0);
    if (ticked.length === 0) discontinuing.reset();
  }

  // Discontinue only those still in use; the Discontinued tab's offers none.
  const active = ticked.filter((item) => item.isActive);
  const tooMany = ticked.length > MAX_AT_ONCE;
  const busy = discontinuing.submitting || undoing.submitting;
  const error = discontinuing.error ?? undoing.error;

  function undo() {
    if (!changed) return;
    const { changes } = changed;
    setChanged(null);
    void undoing.submit(() => changeMany(changes));
  }

  const selected = intl.formatMessage(
    {
      id: 'products.bulk.selected',
      defaultMessage: '{count, plural, other {# selected}}',
    },
    { count: ticked.length },
  );

  return (
    <>
      {/* How many are ticked, said as it changes (WCAG 4.1.3): here, there
          while the bar comes and goes with the ticks. */}
      <Box role="status" sx={HIDDEN}>
        {ticked.length > 0 && selected}
      </Box>

      {error && <FormError message={error} />}

      {ticked.length > 0 && (
        <Paper
          variant="outlined"
          component="section"
          aria-label={intl.formatMessage({
            id: 'products.bulk.region',
            defaultMessage: 'Selected items',
          })}
          sx={{ px: 2, py: 1, borderColor: 'primary.main' }}
        >
          <Stack
            direction="row"
            useFlexGap
            sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
          >
            <Typography sx={{ fontWeight: 700, flex: '1 1 auto' }}>
              {selected}
            </Typography>
            {tooMany && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {intl.formatMessage(
                  {
                    id: 'products.bulk.tooMany',
                    defaultMessage:
                      'Up to {max} at once. Untick some to go on.',
                  },
                  { max: MAX_AT_ONCE },
                )}
              </Typography>
            )}
            <Button
              variant="outlined"
              startIcon={<FolderOutlined />}
              disabled={busy || tooMany}
              onClick={openDialog(() => setMoving(true))}
            >
              {intl.formatMessage({
                id: 'products.bulk.setCategory',
                defaultMessage: 'Set category',
              })}
            </Button>
            {active.length > 0 && (
              <Button
                variant="outlined"
                disabled={busy || tooMany}
                onClick={() =>
                  void discontinuing.submit(() =>
                    changeMany(
                      active.map((item) => ({ id: item.id, isActive: false })),
                    ),
                  )
                }
              >
                {discontinuing.submitting
                  ? intl.formatMessage({
                      id: 'products.bulk.discontinuing',
                      defaultMessage: 'Discontinuing…',
                    })
                  : intl.formatMessage({
                      id: 'products.discontinue',
                      defaultMessage: 'Discontinue',
                    })}
              </Button>
            )}
            {ticked.length < shown && (
              <Button
                variant="text"
                disabled={busy}
                onClick={onTickAll}
                sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
              >
                {intl.formatMessage({
                  id: 'products.bulk.selectAll',
                  defaultMessage: 'Select all shown',
                })}
              </Button>
            )}
            <Button variant="text" disabled={busy} onClick={onClear}>
              {intl.formatMessage({
                id: 'products.bulk.clear',
                defaultMessage: 'Clear',
              })}
            </Button>
          </Stack>
        </Paper>
      )}

      {moving && (
        <SetCategoryDialog
          ticked={ticked}
          categories={categories}
          onClose={() => setMoving(false)}
          onMoved={(changes, category) => {
            setMoving(false);
            done(
              intl.formatMessage(
                {
                  id: 'products.bulk.moved',
                  defaultMessage:
                    'Moved {count, plural, one {# item} other {# items}} to {category}.',
                },
                { count: changes.length, category },
              ),
              changes,
            );
          }}
        />
      )}

      {/* Its own timer, held while focus or the pointer is on it and run
          again once both have left; one per change. */}
      <UndoSnackbar
        key={changed?.key}
        open={changed !== null}
        autoHideDuration={UNDO_MS}
        onClose={(_event, reason) => {
          // A click elsewhere is somebody carrying on, not deciding.
          if (reason !== 'clickaway') setChanged(null);
        }}
        message={changed?.message}
        action={
          // Text, not the theme's filled default, whose grey under the
          // message's light words was under AA; its ring in those words
          // too, as the accent's is under 3 : 1 on the dark message.
          <Button
            ref={undoButton}
            variant="text"
            color="inherit"
            onClick={undo}
            sx={{ '&.Mui-focusVisible': { outlineColor: 'currentColor' } }}
          >
            {intl.formatMessage({
              id: 'products.bulk.undo',
              defaultMessage: 'Undo',
            })}
          </Button>
        }
        slotProps={{ content: { role: 'status' } }}
      />
    </>
  );
}

/**
 * Set category (ADR-092): which, from the whole tree or None, then Move,
 * sending only the ticked items not in it already. It opens with nothing
 * chosen; the one chosen holding them all already says so, and Move waits
 * for another.
 */
function SetCategoryDialog({
  ticked,
  categories,
  onClose,
  onMoved,
}: {
  ticked: ProductSummary[];
  categories: readonly ProductCategory[];
  onClose: () => void;
  /** The values before, and the category's name, as the message says it. */
  onMoved: (changes: ProductChange[], category: string) => void;
}) {
  const intl = useIntl();
  const categoryOf = (item: ProductSummary) => item.category?.id ?? '';
  const [value, setValue] = useState(NOT_CHOSEN);

  const chosen = value !== NOT_CHOSEN;
  const moving = chosen
    ? ticked.filter((item) => categoryOf(item) !== value)
    : [];
  const name =
    categories.find((category) => category.id === value)?.name ??
    intl.formatMessage({
      id: 'products.category.none',
      defaultMessage: 'Uncategorised',
    });

  const { submitting, error, submit } = useSubmit<ProductChanges>((result) =>
    onMoved(result.items, name),
  );

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (moving.length === 0) return;
    void submit(() =>
      changeMany(
        moving.map((item) => ({ id: item.id, categoryId: value || null })),
      ),
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          {intl.formatMessage(
            {
              id: 'products.bulk.moveTitle',
              defaultMessage:
                'Set the category of {count, plural, one {# item} other {# items}}',
            },
            { count: ticked.length },
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}
            <CategorySelect
              id="items-set-category"
              label={intl.formatMessage({
                id: 'products.category',
                defaultMessage: 'Category',
              })}
              emptyLabel={intl.formatMessage({
                id: 'products.category.noneChoice',
                defaultMessage: 'None (Uncategorised)',
              })}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              unchosen={intl.formatMessage({
                id: 'products.bulk.chooseCategory',
                defaultMessage: 'Choose a category',
              })}
              helperText={
                chosen && moving.length === 0
                  ? intl.formatMessage(
                      {
                        id: 'products.bulk.alreadyThere',
                        defaultMessage:
                          '{count, plural, one {It is} other {They are all}} in this category already.',
                      },
                      { count: ticked.length },
                    )
                  : undefined
              }
              fullWidth
              categories={categories}
            />
          </Stack>
        </DialogContent>
        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          label={intl.formatMessage({
            id: 'products.bulk.move',
            defaultMessage: 'Move',
          })}
          pendingLabel={intl.formatMessage({
            id: 'products.bulk.moving',
            defaultMessage: 'Moving…',
          })}
          disabled={moving.length === 0}
        />
      </form>
    </Dialog>
  );
}
