import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type { ProductCategory, ProductDetail } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { CategorySelect } from './category-select';
import {
  isProductType,
  PRODUCT_TYPES,
  productTypeLabel,
} from './product-types';

/**
 * Edit on the item's page (ADR-092, #306's 30): its name, description,
 * category and type. The name and description are the base ones, which
 * documents print where a language has none of its own (ADR-056). The
 * type may change at any time, since it forks nothing (ADR-023): the item
 * moves to that tab and in the pickers' order, its stock, lots and History
 * stay, and History records the change.
 *
 * Only what changed is sent, so History records what the person changed.
 * Rendered only while open, so each opening starts from the item as saved.
 */
export function EditItemDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductDetail;
  categories: readonly ProductCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? '',
    categoryId: product.categoryId ?? '',
    type: product.type,
  });
  const [needsName, setNeedsName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const { submitting, error, submit } = useSubmit(
    async () => {
      onClose();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'products.edit.saved',
        defaultMessage: 'Item saved',
      }),
    },
  );

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (field === 'name') setNeedsName(false);
    };
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setNeedsName(true);
      nameRef.current?.focus();
      return;
    }

    const changed: Record<string, unknown> = {};
    if (form.name !== product.name) changed.name = form.name;
    if (form.description !== (product.description ?? '')) {
      changed.description = form.description;
    }
    if (form.categoryId !== (product.categoryId ?? '')) {
      changed.categoryId = form.categoryId || null;
    }
    if (form.type !== product.type) changed.type = form.type;

    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }

    void submit(() =>
      api(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changed),
      }),
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          {intl.formatMessage({
            id: 'products.edit.title',
            defaultMessage: 'Edit the item',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="item-name"
              inputRef={nameRef}
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              error={needsName}
              helperText={
                needsName
                  ? intl.formatMessage({
                      id: 'products.create.needsName',
                      defaultMessage: 'Give it a name.',
                    })
                  : undefined
              }
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="item-description"
              label={intl.formatMessage({
                id: 'products.description',
                defaultMessage: 'Description',
              })}
              multiline
              rows={2}
              fullWidth
              value={form.description}
              onChange={update('description')}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />

            <CategorySelect
              id="item-category"
              label={intl.formatMessage({
                id: 'products.category',
                defaultMessage: 'Category',
              })}
              emptyLabel={intl.formatMessage({
                id: 'products.category.noneChoice',
                defaultMessage: 'None (Uncategorised)',
              })}
              value={form.categoryId}
              onChange={update('categoryId')}
              fullWidth
              categories={categories}
            />

            <TextField
              id="item-type"
              label={intl.formatMessage({
                id: 'products.typeLabel',
                defaultMessage: 'Type',
              })}
              select
              fullWidth
              value={form.type}
              onChange={update('type')}
              helperText={intl.formatMessage({
                id: 'products.edit.typeHelp',
                defaultMessage:
                  'A new type moves it to that tab, and in the pickers’ order. Its stock, lots and History stay as they are.',
              })}
            >
              {/* A type this client does not know stays offered as it is. */}
              {!isProductType(product.type) && (
                <MenuItem value={product.type}>{product.type}</MenuItem>
              )}
              {PRODUCT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {productTypeLabel(type, intl)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          label={intl.formatMessage({
            id: 'common.save',
            defaultMessage: 'Save',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
