import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
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
  const intl = useIntl();
  // Shown the reader's way, 12,5000 in French, and read back the same.
  const [unitPrice, setUnitPrice] = useState(
    line?.unitPrice ? formatQuantity(line.unitPrice) : '',
  );
  // Set when the price is typed with a thousands separator (ADR-054).
  const [priceError, setPriceError] = useState<string | null>(null);
  const [taxCodeId, setTaxCodeId] = useState(line?.taxCodeId ?? '');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'orders.lines.saved',
        defaultMessage: 'Line saved',
      }),
    },
  );

  function close() {
    setPriceError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!line) return;

    const price = toApiDecimal(unitPrice);
    if (price === null) {
      setPriceError(groupedNumberMessage());
      return;
    }
    setPriceError(null);

    void submit(() =>
      api(`/invoices/${invoiceId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unitPrice: price,
          taxCodeId: taxCodeId || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog
      open={line !== null}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{line?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              {line &&
                intl.formatMessage(
                  {
                    id: 'invoices.line.asShipped',
                    defaultMessage:
                      '{description} — quantity {quantity}, as shipped.',
                  },
                  {
                    description: line.description,
                    quantity: formatQuantity(line.quantity),
                  },
                )}
            </Typography>

            <TextField
              id="invoice-line-price"
              label={intl.formatMessage({
                id: 'orders.unitPrice',
                defaultMessage: 'Unit price',
              })}
              required
              fullWidth
              value={unitPrice}
              onChange={(event) => {
                setPriceError(null);
                setUnitPrice(event.target.value);
              }}
              error={!!priceError}
              helperText={
                priceError ??
                intl.formatMessage({
                  id: 'invoices.line.price.help',
                  defaultMessage: "Defaults to the order's price.",
                })
              }
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />

            <TextField
              id="invoice-line-tax"
              select
              label={intl.formatMessage({
                id: 'invoices.taxCode',
                defaultMessage: 'Tax code',
              })}
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
