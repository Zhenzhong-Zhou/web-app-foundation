import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import type { BomLine } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Quantity, supply type, notes.
 *
 * No component picker: changing which item a line points at is not an edit but
 * a different line, and the server refuses it for that reason. Remove and add
 * instead — both are audited, and the trail says what actually happened rather
 * than showing one line that quietly became another.
 *
 * The caller keys this on the line's id, so opening a different line remounts
 * the component and the fields initialise from props. An effect syncing state
 * to `line` would do the same thing a render later, which is both a cascading
 * render and a window in which the form shows the previous line's quantity.
 */
export function EditBomLineDialog({
  open,
  bomId,
  line,
  onClose,
  onSaved,
}: {
  open: boolean;
  bomId: string | null;
  line: BomLine | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const intl = useIntl();
  // Shown the reader's way, 2,5000 in French, and read back the same.
  const [quantity, setQuantity] = useState(
    line ? formatQuantity(line.quantity) : '',
  );
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [external, setExternal] = useState(line?.supplyType === 'external');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'boms.line.saved',
        defaultMessage: 'Component saved',
      }),
    },
  );

  function close() {
    setQuantityError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!bomId || !line) return;

    const amount = toApiDecimal(quantity);
    if (amount === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api(`/boms/${bomId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: amount,
          supplyType: external ? 'external' : 'stocked',
          notes: notes || undefined,
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
            id: 'boms.line.editTitle',
            defaultMessage: 'Edit component',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="bom-line-edit-quantity"
              label={intl.formatMessage({
                id: 'boms.quantityPerBatch',
                defaultMessage: 'Quantity per batch',
              })}
              required
              fullWidth
              value={quantity}
              onChange={(event) => {
                setQuantityError(null);
                setQuantity(event.target.value);
              }}
              error={!!quantityError}
              helperText={quantityError}
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

            <TextField
              id="bom-line-edit-notes"
              label={intl.formatMessage({
                id: 'boms.notes',
                defaultMessage: 'Notes',
              })}
              fullWidth
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
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
