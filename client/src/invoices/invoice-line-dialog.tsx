import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { InvoiceLine, TaxCode } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * A draft line's price and tax code. Not its quantity: the invoice bills
 * what the shipment carried, and a different quantity is a different
 * shipment (ADR-046).
 */
export function InvoiceLineDialog({
  invoiceId,
  line,
  taxCodes,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  line: InvoiceLine | null;
  taxCodes: TaxCode[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [unitPrice, setUnitPrice] = useState(line?.unitPrice ?? '');
  const [taxCodeId, setTaxCodeId] = useState(line?.taxCodeId ?? '');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Line saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!line) return;

    void submit(() =>
      api(`/invoices/${invoiceId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unitPrice,
          taxCodeId: taxCodeId || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={line !== null} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{line?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              {line?.description} — quantity {line?.quantity}, as shipped.
            </Typography>

            <TextField
              id="invoice-line-price"
              label="Unit price"
              required
              fullWidth
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              helperText="Defaults to the order's price."
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />

            <TextField
              id="invoice-line-tax"
              select
              label="Tax code"
              fullWidth
              value={taxCodeId}
              onChange={(event) => setTaxCodeId(event.target.value)}
            >
              {taxCodes.map((code) => (
                <MenuItem key={code.id} value={code.id}>
                  {code.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close}>
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
