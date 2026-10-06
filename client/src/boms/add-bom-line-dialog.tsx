import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import { groupedNumberMessage, toApiDecimal } from '../lib/format';
import type { VariantOption } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { unitLabel } from '../products/units';

const EMPTY = { componentVariantId: '', quantity: '', notes: '' };

/**
 * Adds one component.
 *
 * `excludeVariantIds` hides the recipe's own output and anything already on
 * it. Both would be refused by the server — the output as a cycle, a repeat as
 * a duplicate line — and a picker that offers a choice the server rejects is a
 * worse way to learn that than not offering it.
 *
 * It does not hide deeper cycles: a component made from this product through
 * another recipe still looks fine here and comes back a 409. Computing that in
 * the browser would mean shipping the whole graph to it.
 */
export function AddBomLineDialog({
  open,
  bomId,
  catalogue,
  excludeVariantIds,
  onClose,
  onAdded,
}: {
  open: boolean;
  bomId: string | null;
  catalogue: VariantOption[];
  excludeVariantIds: string[];
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);
  const [external, setExternal] = useState(false);
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onAdded();
    },
    {
      success: intl.formatMessage({
        id: 'boms.line.added',
        defaultMessage: 'Component added',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    setExternal(false);
    setQuantityError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!bomId) return;

    const quantity = toApiDecimal(form.quantity);
    if (quantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api(`/boms/${bomId}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          componentVariantId: form.componentVariantId,
          quantity,
          supplyType: external ? 'external' : 'stocked',
          notes: form.notes || undefined,
        }),
      }),
    );
  }

  const choices = catalogue.filter(
    (row) => !excludeVariantIds.includes(row.id),
  );

  const unit = catalogue.find(
    (row) => row.id === form.componentVariantId,
  )?.unitOfMeasure;

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
            id: 'boms.line.addTitle',
            defaultMessage: 'Add a component',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <VariantPicker
              id="bom-line-component"
              label={intl.formatMessage({
                id: 'production.component',
                defaultMessage: 'Component',
              })}
              required
              options={choices}
              value={form.componentVariantId}
              onChange={(componentVariantId) =>
                setForm((current) => ({ ...current, componentVariantId }))
              }
            />

            <TextField
              id="bom-line-quantity"
              label={intl.formatMessage({
                id: 'boms.quantityPerBatch',
                defaultMessage: 'Quantity per batch',
              })}
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                setQuantityError(null);
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }));
              }}
              error={!!quantityError}
              helperText={
                quantityError ??
                (unit
                  ? intl.formatMessage(
                      {
                        id: 'boms.line.inUnit',
                        defaultMessage:
                          'In {unit} — what this item is counted in.',
                      },
                      { unit: unitLabel(unit, intl) },
                    )
                  : intl.formatMessage({
                      id: 'boms.line.againstBatch',
                      defaultMessage: 'Against the batch size, not one unit.',
                    }))
              }
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={external}
                  onChange={(event) => setExternal(event.target.checked)}
                />
              }
              label={intl.formatMessage({
                id: 'boms.external',
                defaultMessage: 'The manufacturer provides this',
              })}
            />

            {/* The point people miss: an external line still belongs on the
                recipe. Leaving it off would make the recipe incomplete and
                make bringing it in-house later look like a change (ADR-030). */}
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'boms.line.externalNote',
                defaultMessage:
                  'An external component never enters our stock and no movement is written for it, but it stays on the recipe so the batch record is complete.',
              })}
            </Typography>

            <TextField
              id="bom-line-notes"
              label={intl.formatMessage({
                id: 'boms.notes',
                defaultMessage: 'Notes',
              })}
              fullWidth
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'boms.line.add',
            defaultMessage: 'Add component',
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
