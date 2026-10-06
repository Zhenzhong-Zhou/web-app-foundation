import {
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
import { useSubmit } from '../lib/use-submit';

const EMPTY = {
  number: '',
  authority: '',
  issuedAt: '',
  expiresAt: '',
  notes: '',
};

/**
 * Number and authority together, because the same digits could be issued by
 * two regulators and the pair is what identifies the registration.
 */
export function NewLicenceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCreated();
    },
    {
      success: intl.formatMessage({
        id: 'licences.added',
        defaultMessage: 'Licence added',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/product-licences', {
        method: 'POST',
        body: JSON.stringify({
          number: form.number,
          authority: form.authority,
          // As typed, YYYY-MM-DD (ADR-052).
          issuedAt: form.issuedAt || undefined,
          expiresAt: form.expiresAt || undefined,
          notes: form.notes || undefined,
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
            id: 'licences.addTitle',
            defaultMessage: 'Add a licence',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="licence-number"
              label={intl.formatMessage({
                id: 'invoices.number',
                defaultMessage: 'Number',
              })}
              required
              fullWidth
              value={form.number}
              onChange={update('number')}
              helperText={intl.formatMessage({
                id: 'licences.number.help',
                defaultMessage:
                  'As issued — an NPN, a DIN, a notification number.',
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="licence-authority"
              label={intl.formatMessage({
                id: 'licences.issuedBy',
                defaultMessage: 'Issued by',
              })}
              required
              fullWidth
              value={form.authority}
              onChange={update('authority')}
              helperText={intl.formatMessage({
                id: 'licences.issuedBy.help',
                defaultMessage: 'Health Canada, FDA, TGA.',
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="licence-issued"
              label={intl.formatMessage({
                id: 'licences.issued',
                defaultMessage: 'Issued',
              })}
              type="date"
              fullWidth
              value={form.issuedAt}
              onChange={update('issuedAt')}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={intl.formatMessage({
                id: 'licences.issued.help',
                defaultMessage: 'The date on the notice, if you have it.',
              })}
            />

            <TextField
              id="licence-expires"
              label={intl.formatMessage({
                id: 'licences.validUntil',
                defaultMessage: 'Valid until',
              })}
              type="date"
              fullWidth
              value={form.expiresAt}
              onChange={update('expiresAt')}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={intl.formatMessage({
                id: 'licences.validUntil.helpNew',
                defaultMessage:
                  'Blank for a scheme that does not expire, which includes an NPN.',
              })}
            />

            <TextField
              id="licence-notes"
              label={intl.formatMessage({
                id: 'boms.notes',
                defaultMessage: 'Notes',
              })}
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={update('notes')}
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
