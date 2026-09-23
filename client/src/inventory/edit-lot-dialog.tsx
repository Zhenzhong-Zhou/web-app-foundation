import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { StockRow } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Correcting a lot's expiry, and its code when the code was ours to invent.
 *
 * Not a movement. Every other action on a stock row changes a quantity and
 * writes to the ledger; this changes a fact about the lot and writes nothing
 * to it. Recording two adjustment movements to fix a keystroke would invent
 * stock events that never happened, which is exactly the noise that makes a
 * ledger harder to read.
 */
export function EditLotDialog({
  row,
  onClose,
  onSaved,
}: {
  row: StockRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    code: row?.lotCode ?? '',
    // The API returns a timestamp; a date input wants YYYY-MM-DD.
    expiresAt: row?.lotExpiresAt ? row.lotExpiresAt.slice(0, 10) : '',
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Lot saved' },
  );

  function close() {
    reset();
    onClose();
  }

  /**
   * A printed code is authoritative — on a supplier's box, or on a label
   * already applied to a production run — so renaming the row would make the
   * record disagree with the warehouse. The honest correction there is moving
   * stock between two lots, which leaves a trail. An invented code has no
   * external truth behind it, so a typo is just a typo.
   *
   * The server refuses the rename either way; this only decides whether to
   * offer a field that would be rejected.
   */
  const codeEditable = row?.lotIsAssigned === true;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row?.lotId) return;

    void submit(() =>
      api(`/stock/lots/${row.lotId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code:
            codeEditable && form.code !== row.lotCode ? form.code : undefined,
          // Sent as the date typed rather than a Date built here, which would
          // pin a calendar day to this browser's midnight.
          expiresAt: form.expiresAt || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={!!row} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Lot {row?.lotCode}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-lot-code"
              label="Lot number"
              required
              fullWidth
              disabled={!codeEditable}
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              helperText={
                codeEditable
                  ? 'Nobody printed this code, so a typo can be corrected here.'
                  : 'Printed on the boxes, so it cannot be renamed. Move the stock to the correct lot instead.'
              }
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="edit-lot-expires"
              label="Expires"
              type="date"
              fullWidth
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Leave blank if it does not expire."
            />

            {/* Not a warning about this dialog — a reminder of what it reaches.
                One lot is one run, wherever its units sit. */}
            <Alert severity="info">
              This changes the lot everywhere, not only the units at{' '}
              {row?.locationName}.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
