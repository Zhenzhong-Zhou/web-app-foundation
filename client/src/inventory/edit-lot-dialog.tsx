import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
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
  const intl = useIntl();
  const [form, setForm] = useState({
    code: row?.lotCode ?? '',
    // YYYY-MM-DD both ways, as the date input wants it (ADR-052).
    expiresAt: row?.lotExpiresAt ?? '',
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'inventory.lot.saved',
        defaultMessage: 'Lot saved',
      }),
    },
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
          expiresAt: form.expiresAt || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog
      open={!!row}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            { id: 'inventory.lot.title', defaultMessage: 'Lot {code}' },
            { code: row?.lotCode },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-lot-code"
              label={intl.formatMessage({
                id: 'inventory.lot.number',
                defaultMessage: 'Lot number',
              })}
              required
              fullWidth
              disabled={!codeEditable}
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              helperText={
                codeEditable
                  ? intl.formatMessage({
                      id: 'inventory.lot.codeEditable',
                      defaultMessage:
                        'Nobody printed this code, so a typo can be corrected here.',
                    })
                  : intl.formatMessage({
                      id: 'inventory.lot.codePrinted',
                      defaultMessage:
                        'Printed on the boxes, so it cannot be renamed. Move the stock to the correct lot instead.',
                    })
              }
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="edit-lot-expires"
              label={intl.formatMessage({
                id: 'inventory.lot.expires',
                defaultMessage: 'Expires',
              })}
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
              helperText={intl.formatMessage({
                id: 'inventory.lot.expires.help',
                defaultMessage: 'Leave blank if it does not expire.',
              })}
            />

            {/* Not a warning about this dialog — a reminder of what it reaches.
                One lot is one run, wherever its units sit. */}
            <Alert severity="info">
              {intl.formatMessage(
                {
                  id: 'inventory.lot.changesEverywhere',
                  defaultMessage:
                    'This changes the lot everywhere, not only the units at {location}.',
                },
                { location: row?.locationName },
              )}
            </Alert>
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
