import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { CurrencyField } from '../components/currency-field';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { NeedsCostEntry } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Sets or corrects what one acquisition cost (ADR-048): a receipt, a count
 * that added stock, or the opening balance.
 *
 * Per unit, in the currency it was paid in. A rate is asked for only when
 * that is not the base currency, and even then it is optional: left blank,
 * the server uses the rate on file for the day the stock arrived, and says so
 * if there is none.
 *
 * The total is never worked out here. The server computes it (ADR-025) and
 * splits it between stock still on the shelf and stock already gone.
 */
export function SetCostDialog({
  open,
  entry,
  baseCurrency,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: NeedsCostEntry | null;
  baseCurrency: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [unitPrice, setUnitPrice] = useState(entry?.unitPrice ?? '');
  const [currency, setCurrency] = useState(entry?.currency ?? baseCurrency);
  const [exchangeRate, setExchangeRate] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Cost set' },
  );

  const foreign = currency.trim().toUpperCase() !== baseCurrency;

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!entry) return;

    void submit(() =>
      api(`/costs/valuations/${entry.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          unitPrice: unitPrice.trim(),
          currency: currency.trim().toUpperCase(),
          // Only for a foreign price; the server refuses a rate on the base.
          ...(foreign && exchangeRate.trim()
            ? { exchangeRate: exchangeRate.trim() }
            : {}),
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Set cost</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {entry && (
              <Typography variant="body2" color="text.secondary">
                {entry.sku}
                {entry.lotCode ? ` · lot ${entry.lotCode}` : ''} —{' '}
                {entry.quantity}
              </Typography>
            )}

            {error && <FormError message={error} />}

            <TextField
              id="set-cost-unit-price"
              label="Unit price"
              required
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              helperText="Per unit, as the supplier charged it."
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />

            <CurrencyField
              id="set-cost-currency"
              required
              value={currency}
              onChange={setCurrency}
            />

            {foreign && (
              <TextField
                id="set-cost-exchange-rate"
                label="Exchange rate"
                value={exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
                helperText={`${baseCurrency} per ${currency || 'unit'}. Leave blank to use the rate on file for the day it arrived.`}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Set cost"
          pendingLabel="Saving…"
          disabled={!entry}
        />
      </form>
    </Dialog>
  );
}
