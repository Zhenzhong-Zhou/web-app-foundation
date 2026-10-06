import {
  Alert,
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
import type { ProductLicence } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * The number stays editable: it is identity, not history. A typo corrected
 * here corrects every recipe pointing at this row, which is the reason a
 * licence is a table rather than a column.
 *
 * Deactivating is the nearest thing to deleting. Recipes made under it keep
 * pointing at it, so a finished lot still traces back to what it was made
 * under.
 */
export function EditLicenceDialog({
  licence,
  onClose,
  onSaved,
}: {
  licence: ProductLicence | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState({
    number: licence?.number ?? '',
    authority: licence?.authority ?? '',
    // YYYY-MM-DD both ways, as the date input wants it (ADR-052).
    issuedAt: licence?.issuedAt ?? '',
    expiresAt: licence?.expiresAt ?? '',
    notes: licence?.notes ?? '',
    isActive: licence?.isActive ?? true,
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'licences.saved',
        defaultMessage: 'Licence saved',
      }),
    },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!licence) return;

    void submit(() =>
      api(`/product-licences/${licence.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          number: form.number,
          authority: form.authority,
          // Blank clears the date.
          issuedAt: form.issuedAt || null,
          expiresAt: form.expiresAt || null,
          notes: form.notes || undefined,
          isActive: form.isActive,
        }),
      }),
    );
  }

  return (
    <Dialog
      open={!!licence}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            { id: 'licences.title', defaultMessage: 'Licence {number}' },
            { number: licence?.number },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-licence-number"
              label={intl.formatMessage({
                id: 'invoices.number',
                defaultMessage: 'Number',
              })}
              required
              fullWidth
              value={form.number}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-licence-authority"
              label={intl.formatMessage({
                id: 'licences.issuedBy',
                defaultMessage: 'Issued by',
              })}
              required
              fullWidth
              value={form.authority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  authority: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-licence-notes"
              label={intl.formatMessage({
                id: 'boms.notes',
                defaultMessage: 'Notes',
              })}
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <TextField
              id="edit-licence-issued"
              label={intl.formatMessage({
                id: 'licences.issued',
                defaultMessage: 'Issued',
              })}
              type="date"
              fullWidth
              value={form.issuedAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  issuedAt: event.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={intl.formatMessage({
                id: 'licences.issued.help',
                defaultMessage: 'The date on the notice, if you have it.',
              })}
            />

            <TextField
              id="edit-licence-expires"
              label={intl.formatMessage({
                id: 'licences.validUntil',
                defaultMessage: 'Valid until',
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
                id: 'licences.validUntil.help',
                defaultMessage: 'Blank for a scheme that does not expire.',
              })}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
              }
              label={intl.formatMessage({
                id: 'licences.status.current',
                defaultMessage: 'Current',
              })}
            />

            {!form.isActive && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'licences.withdrawnNote',
                  defaultMessage:
                    'Withdrawn licences stay on recipes that were made under them — only new recipes stop offering it.',
                })}
              </Alert>
            )}
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
