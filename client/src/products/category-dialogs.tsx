import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useId, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  ProductCategory,
  ProductCategoryEnvelope,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, ApiError } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { NAME_MAX_LENGTH } from '../lib/validation';
import { CategorySelect } from './category-select';
import { branchOf, categoryPlaces } from './item-list';

/** What Settings › Categories' one dialog does: add, rename or move. */
export type CategoryChange =
  | { kind: 'add' }
  | { kind: 'rename'; category: ProductCategory }
  | { kind: 'move'; category: ProductCategory };

/**
 * Add a category, with its name and where it goes; rename one; or move
 * one, under another or to the top (ADR-092). Move's list leaves out the
 * category and every one under it, where the server refuses it, and Move
 * waits until another place is chosen. A name already used beside it is
 * the server's to refuse, in its words.
 */
export function CategoryDialog({
  change,
  categories,
  onClose,
  onSaved,
}: {
  change: CategoryChange;
  categories: readonly ProductCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const category = change.kind === 'add' ? null : change.category;
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');

  // Under: the whole tree to add; to move, all but its own branch.
  const banned =
    change.kind === 'move' ? branchOf(categories, change.category.id) : null;
  const placeName = (id: string) =>
    categoryPlaces(categories)
      .find((place) => place.id === id)
      ?.path.join(' › ') ?? '';
  const unmoved =
    change.kind === 'move' && parentId === (change.category.parentId ?? '');

  const { submitting, error, submit } = useSubmit(() => onSaved(), {
    success: () => {
      const saved = name.trim();
      if (change.kind === 'add') {
        return intl.formatMessage(
          { id: 'categories.added', defaultMessage: 'Added {name}.' },
          { name: saved },
        );
      }
      if (change.kind === 'rename') {
        return intl.formatMessage(
          { id: 'categories.renamed', defaultMessage: 'Renamed to {name}.' },
          { name: saved },
        );
      }
      return parentId
        ? intl.formatMessage(
            {
              id: 'categories.moved',
              defaultMessage: 'Moved {name} under {parent}.',
            },
            { name: change.category.name, parent: placeName(parentId) },
          )
        : intl.formatMessage(
            {
              id: 'categories.movedTop',
              defaultMessage: 'Moved {name} to the top.',
            },
            { name: change.category.name },
          );
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (change.kind === 'add') {
      void submit(() =>
        api<ProductCategoryEnvelope>('/products/categories', {
          method: 'POST',
          body: JSON.stringify({ name, parentId: parentId || null }),
        }),
      );
      return;
    }
    if (unmoved) return;
    void submit(() =>
      api(`/products/categories/${change.category.id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          change.kind === 'rename' ? { name } : { parentId: parentId || null },
        ),
      }),
    );
  }

  const title =
    change.kind === 'add'
      ? intl.formatMessage({
          id: 'categories.addTitle',
          defaultMessage: 'Add a category',
        })
      : change.kind === 'rename'
        ? intl.formatMessage(
            { id: 'categories.renameTitle', defaultMessage: 'Rename {name}' },
            { name: change.category.name },
          )
        : intl.formatMessage(
            { id: 'categories.moveTitle', defaultMessage: 'Move {name}' },
            { name: change.category.name },
          );

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {change.kind !== 'move' && (
              <TextField
                id="category-name"
                label={intl.formatMessage({
                  id: 'common.name',
                  defaultMessage: 'Name',
                })}
                required
                fullWidth
                value={name}
                onChange={(event) => setName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
              />
            )}

            {change.kind !== 'rename' && (
              <CategorySelect
                id="category-parent"
                label={intl.formatMessage({
                  id: 'categories.under',
                  defaultMessage: 'Under',
                })}
                emptyLabel={intl.formatMessage({
                  id: 'categories.top',
                  defaultMessage: 'None (at the top)',
                })}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                helperText={
                  unmoved
                    ? intl.formatMessage({
                        id: 'categories.alreadyThere',
                        defaultMessage:
                          'It is there already. Choose another place.',
                      })
                    : change.kind === 'move'
                      ? intl.formatMessage({
                          id: 'categories.moveHelp',
                          defaultMessage:
                            'Its items and the categories under it move with it. It cannot go under itself, so those are not listed.',
                        })
                      : undefined
                }
                fullWidth
                categories={categories}
                leaveOut={banned}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          disabled={unmoved}
          label={
            change.kind === 'add'
              ? intl.formatMessage({
                  id: 'categories.add',
                  defaultMessage: 'Add category',
                })
              : change.kind === 'rename'
                ? intl.formatMessage({
                    id: 'categories.rename',
                    defaultMessage: 'Rename',
                  })
                : intl.formatMessage({
                    id: 'categories.move',
                    defaultMessage: 'Move',
                  })
          }
          pendingLabel={
            change.kind === 'add'
              ? intl.formatMessage({
                  id: 'common.adding',
                  defaultMessage: 'Adding…',
                })
              : intl.formatMessage({
                  id: 'common.saving',
                  defaultMessage: 'Saving…',
                })
          }
        />
      </form>
    </Dialog>
  );
}

/**
 * Delete an empty category, asked first, since it cannot be undone (the
 * design language's Actions that cannot be undone). One that something
 * was put in since the tree was read is refused by the server, whose
 * words `onRefused` takes to its row.
 */
export function DeleteCategoryDialog({
  category,
  onClose,
  onDeleted,
  onRefused,
}: {
  category: ProductCategory;
  onClose: () => void;
  onDeleted: () => Promise<void>;
  onRefused: (message: string) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const { submitting, error, submit } = useSubmit(() => onDeleted(), {
    success: intl.formatMessage(
      { id: 'categories.deleted', defaultMessage: 'Deleted {name}.' },
      { name: category.name },
    ),
  });

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby={`${id}-title`}
    >
      <DialogTitle id={`${id}-title`}>
        {intl.formatMessage(
          { id: 'categories.deleteTitle', defaultMessage: 'Delete {name}?' },
          { name: category.name },
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <FormError message={error} />}
          <DialogContentText>
            {intl.formatMessage({
              id: 'categories.deleteBody',
              defaultMessage:
                'Nothing is in it. It cannot be undone; History keeps its name.',
            })}
          </DialogContentText>
        </Stack>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={onClose}
        destructive
        label={intl.formatMessage({
          id: 'categories.deleteConfirm',
          defaultMessage: 'Delete category',
        })}
        pendingLabel={intl.formatMessage({
          id: 'categories.deleting',
          defaultMessage: 'Deleting…',
        })}
        onConfirm={() =>
          void submit(async () => {
            try {
              await api(`/products/categories/${category.id}`, {
                method: 'DELETE',
              });
            } catch (caught) {
              if (caught instanceof ApiError && caught.status === 409) {
                onRefused(caught.message);
              }
              throw caught;
            }
          })
        }
      />
    </Dialog>
  );
}
