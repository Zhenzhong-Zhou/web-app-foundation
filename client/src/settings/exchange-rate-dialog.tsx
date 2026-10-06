import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { CurrencyField } from '../components/currency-field';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { groupedNumberMessage, toApiDecimal } from '../lib/format';
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
  const intl = useIntl();
  const [currency, setCurrency] = useState(initial?.currency ?? '');
  // Set when the rate is typed with a thousands separator (ADR-054).
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateDate, setRateDate] = useState(initial?.rateDate ?? today());
  const [rate, setRate] = useState(initial?.rate ?? '');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'settings.rates.saved',
        defaultMessage: 'Rate saved',
      }),
    },
  );

  function close() {
    setRateError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const value = toApiDecimal(rate);
    if (value === null) {
      setRateError(groupedNumberMessage());
      return;
    }
    setRateError(null);

    void submit(() =>
      api('/costs/exchange-rates', {
        method: 'PUT',
        body: JSON.stringify({
          currency: currency.trim().toUpperCase(),
          rateDate,
          rate: value,
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
        <DialogTitle>
          {initial
            ? intl.formatMessage({
                id: 'settings.rates.correctTitle',
                defaultMessage: 'Correct a rate',
              })
            : intl.formatMessage({
                id: 'settings.rates.set',
                defaultMessage: 'Set a rate',
              })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <CurrencyField
              id="exchange-rate-currency"
              required
              value={currency}
              onChange={setCurrency}
              disabled={initial !== null}
              helperText={intl.formatMessage(
                {
                  id: 'settings.rates.convertedInto',
                  defaultMessage: 'Converted into {currency}.',
                },
                { currency: baseCurrency },
              )}
            />

            <TextField
              id="exchange-rate-date"
              label={intl.formatMessage({
                id: 'settings.rates.day',
                defaultMessage: 'Day',
              })}
              type="date"
              required
              value={rateDate}
              onChange={(event) => setRateDate(event.target.value)}
              disabled={initial !== null}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              id="exchange-rate-rate"
              label={intl.formatMessage({
                id: 'settings.rates.rate',
                defaultMessage: 'Rate',
              })}
              required
              value={rate}
              onChange={(event) => {
                setRateError(null);
                setRate(event.target.value);
              }}
              error={!!rateError}
              helperText={
                rateError ??
                intl.formatMessage(
                  {
                    id: 'settings.rates.howMany',
                    defaultMessage:
                      'How many {base} one {currency} is worth that day.',
                  },
                  {
                    base: baseCurrency,
                    currency:
                      currency ||
                      intl.formatMessage({
                        id: 'costs.set.unit',
                        defaultMessage: 'unit',
                      }),
                  },
                )
              }
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'settings.rates.save',
            defaultMessage: 'Save rate',
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
