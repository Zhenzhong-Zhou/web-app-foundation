import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { CurrencyField } from '../components/currency-field';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/** Today in the browser's calendar, as the YYYY-MM-DD the server takes. */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Sets one currency's rate for one day (ADR-048). A PUT: the day is the
 * identity, so entering a day again corrects it rather than adding a second.
 *
 * Changes nothing already valued. A receipt copies the rate it used, and one
 * that found no rate waits in the needs-cost list for someone to set its cost.
 */
export function ExchangeRateDialog({
  open,
  initial,
  baseCurrency,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Prefilled when correcting a rate already entered. */
  initial: { currency: string; rateDate: string; rate: string } | null;
  baseCurrency: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [currency, setCurrency] = useState(initial?.currency ?? '');
  const [rateDate, setRateDate] = useState(initial?.rateDate ?? today());
  const [rate, setRate] = useState(initial?.rate ?? '');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Rate saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/costs/exchange-rates', {
        method: 'PUT',
        body: JSON.stringify({
          currency: currency.trim().toUpperCase(),
          rateDate,
          rate: rate.trim(),
        }),
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{initial ? 'Correct a rate' : 'Set a rate'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <CurrencyField
              id="exchange-rate-currency"
              required
              value={currency}
              onChange={setCurrency}
              disabled={initial !== null}
              helperText={`Converted into ${baseCurrency}.`}
            />

            <TextField
              id="exchange-rate-date"
              label="Day"
              type="date"
              required
              value={rateDate}
              onChange={(event) => setRateDate(event.target.value)}
              disabled={initial !== null}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              id="exchange-rate-rate"
              label="Rate"
              required
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              helperText={`How many ${baseCurrency} one ${currency || 'unit'} is worth that day.`}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Save rate"
          pendingLabel="Saving…"
        />
      </form>
    </Dialog>
  );
}
