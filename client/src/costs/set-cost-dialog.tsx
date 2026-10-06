import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { CurrencyField } from '../components/currency-field';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
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
  const intl = useIntl();
  // Shown the reader's way, 1,2653 in French, and read back the same.
  const [unitPrice, setUnitPrice] = useState(
    entry?.unitPrice ? formatQuantity(entry.unitPrice) : '',
  );
  // Set when a number is typed with a thousands separator (ADR-054).
  const [numberError, setNumberError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(entry?.currency ?? baseCurrency);
  const [exchangeRate, setExchangeRate] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'costs.set.done',
        defaultMessage: 'Cost set',
      }),
    },
  );

  const foreign = currency.trim().toUpperCase() !== baseCurrency;

  function close() {
    setNumberError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!entry) return;

    const price = toApiDecimal(unitPrice);
    const rate =
      foreign && exchangeRate.trim() ? toApiDecimal(exchangeRate) : '';
    if (price === null || rate === null) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(() =>
      api(`/costs/valuations/${entry.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          unitPrice: price,
          currency: currency.trim().toUpperCase(),
          // Only for a foreign price; the server refuses a rate on the base.
          ...(rate ? { exchangeRate: rate } : {}),
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
          {intl.formatMessage({
            id: 'costs.set.title',
            defaultMessage: 'Set cost',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {entry && (
              <Typography variant="body2" color="text.secondary">
                {entry.lotCode
                  ? intl.formatMessage(
                      {
                        id: 'costs.set.entryWithLot',
                        defaultMessage: '{sku} · lot {lot} — {quantity}',
                      },
                      {
                        sku: entry.sku,
                        lot: entry.lotCode,
                        quantity: formatQuantity(entry.quantity),
                      },
                    )
                  : [entry.sku, formatQuantity(entry.quantity)].join(' — ')}
              </Typography>
            )}

            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}

            <TextField
              id="set-cost-unit-price"
              label={intl.formatMessage({
                id: 'orders.unitPrice',
                defaultMessage: 'Unit price',
              })}
              required
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              helperText={intl.formatMessage({
                id: 'costs.set.price.help',
                defaultMessage: 'Per unit, as the supplier charged it.',
              })}
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
                label={intl.formatMessage({
                  id: 'costs.exchangeRate',
                  defaultMessage: 'Exchange rate',
                })}
                value={exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
                helperText={intl.formatMessage(
                  {
                    id: 'costs.set.rate.help',
                    defaultMessage:
                      '{base} per {currency}. Leave blank to use the rate on file for the day it arrived.',
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
                )}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'costs.set.title',
            defaultMessage: 'Set cost',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
          disabled={!entry}
        />
      </form>
    </Dialog>
  );
}
