import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { PRODUCT_TYPES, productTypeLabel } from './product-types';

const EMPTY = {
  type: 'good',
  name: '',
  description: '',
  sku: '',
  variantName: '',
};

/**
 * One form, two rows. ADR-023 requires every product to have at least one
 * variant, and this is where that meets a UI that should not mention variants
 * when there is only one — the SKU field is the variant, and the person never
 * learns the word.
 *
 * A second size is added from the product's detail page, which is where the
 * concept becomes visible because it has become real.
 */
export function CreateProductDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);
  const [tracksLots, setTracksBatches] = useState(false);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCreated();
    },
    {
      success: intl.formatMessage({
        id: 'products.added',
        defaultMessage: 'Product added',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    setTracksBatches(false);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // 409 names the SKU, so the person knows whether they meant the existing
    // item or have a collision in their own numbering.
    void submit(() =>
      api('/products', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          description: form.description || undefined,
          variant: {
            sku: form.sku,
            name: form.variantName || undefined,
            tracksLots,
          },
        }),
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'products.create.title',
            defaultMessage: 'Add a product',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="product-type"
              label={intl.formatMessage({
                id: 'products.typeLabel',
                defaultMessage: 'Type',
              })}
              select
              required
              fullWidth
              value={form.type}
              onChange={update('type')}
            >
              {PRODUCT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {productTypeLabel(type, intl)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="product-name"
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="product-description"
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

            <TextField
              id="product-sku"
              label={intl.formatMessage({
                id: 'products.sku',
                defaultMessage: 'SKU',
              })}
              required
              fullWidth
              value={form.sku}
              onChange={update('sku')}
              helperText={intl.formatMessage({
                id: 'products.sku.help',
                defaultMessage:
                  'Typed, not generated — this is the code on the label.',
              })}
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="variant-name"
              label={intl.formatMessage({
                id: 'products.variation',
                defaultMessage: 'Size or variation',
              })}
              fullWidth
              value={form.variantName}
              onChange={update('variantName')}
              helperText={intl.formatMessage({
                id: 'products.variation.helpOptional',
                defaultMessage:
                  'Optional. 60ct, Large, Blue — leave blank if there is only one.',
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={tracksLots}
                  onChange={(event) => setTracksBatches(event.target.checked)}
                />
              }
              // Cannot be changed later: flipping it on a variant with stock
              // leaves every row violating the invariant in one direction or
              // the other (ADR-023).
              label={intl.formatMessage({
                id: 'products.tracksLots',
                defaultMessage: 'Track lot numbers and expiry',
              })}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'products.add',
            defaultMessage: 'Add product',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.adding',
            defaultMessage: 'Adding…',
          })}
        />
      </form>
    </Dialog>
  );
}
