import { Button, MenuItem, Paper, Stack, TextField } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { BLANK_LINE } from '../lib/format';
import type { InvoiceDetail, TaxCode } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * The draft's own fields, and one tax code for every line at once — most
 * invoices carry a single tax treatment, and setting it line by line is
 * the slow way to the same answer.
 */
export function DraftDetails({
  invoice,
  taxCodes,
  onSaved,
}: {
  invoice: InvoiceDetail;
  taxCodes: TaxCode[];
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? '');
  const [note, setNote] = useState(invoice.note ?? '');
  const [taxCodeId, setTaxCodeId] = useState('');

  const details = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'invoices.saved',
      defaultMessage: 'Invoice saved',
    }),
  });
  const tax = useSubmit(
    async () => {
      setTaxCodeId('');
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'invoices.taxCode.applied',
        defaultMessage: 'Tax code set on every line',
      }),
    },
  );

  function saveDetails(event: SubmitEvent) {
    event.preventDefault();

    // Empty clears: a cleared date field arrives as "".
    void details.submit(() =>
      api(`/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueDate: dueDate || null, note }),
      }),
    );
  }

  function applyTaxCode() {
    void tax.submit(() =>
      api(`/invoices/${invoice.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ taxCodeId }),
      }),
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <form onSubmit={saveDetails}>
          <Stack spacing={2}>
            {details.error && <FormError message={details.error} />}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="invoice-due-date"
                label={intl.formatMessage({
                  id: 'invoices.dueDate',
                  defaultMessage: 'Due date',
                })}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ minWidth: 200 }}
              />
              <TextField
                id="invoice-note"
                label={intl.formatMessage({
                  id: 'invoices.note',
                  defaultMessage: 'Note on the invoice',
                })}
                fullWidth
                value={note}
                onChange={(event) => setNote(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'invoices.note.help',
                  defaultMessage:
                    'Printed for the customer: a PO number, a thank-you.',
                })}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            </Stack>

            <Button
              type="submit"
              variant="outlined"
              disabled={details.submitting}
              sx={{ alignSelf: 'flex-start' }}
            >
              {details.submitting
                ? intl.formatMessage({
                    id: 'common.saving',
                    defaultMessage: 'Saving…',
                  })
                : intl.formatMessage({
                    id: 'invoices.saveDetails',
                    defaultMessage: 'Save details',
                  })}
            </Button>
          </Stack>
        </form>

        {tax.error && <FormError message={tax.error} />}

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <TextField
            id="invoice-tax-code"
            select
            label={intl.formatMessage({
              id: 'invoices.taxCode.everyLine',
              defaultMessage: 'Tax code for every line',
            })}
            value={taxCodeId}
            onChange={(event) => setTaxCodeId(event.target.value)}
            sx={{ minWidth: 260 }}
            helperText={
              taxCodes.length === 0
                ? intl.formatMessage({
                    id: 'invoices.taxCode.none',
                    defaultMessage: 'No tax codes yet — add them in Tax codes.',
                  })
                : BLANK_LINE
            }
          >
            {taxCodes.map((code) => (
              <MenuItem key={code.id} value={code.id}>
                {code.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            onClick={applyTaxCode}
            disabled={!taxCodeId || tax.submitting}
          >
            {intl.formatMessage({
              id: 'invoices.taxCode.apply',
              defaultMessage: 'Apply to every line',
            })}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
