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

import { CurrencyField } from '../components/currency-field';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import type { OrderLine, OrderStatus } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Quantity and price, and a dialog rather than inline fields.
 *
 * On a confirmed order this changes something a supplier was told, not a typo
 * — it deserves an explicit save, and it lands in the audit log either way
 * (ADR-033). Inline editing suits a SKU rename, where the old value was simply
 * wrong.
 *
 * No item picker: pointing a line at a different variant is not an edit but a
 * different line. Remove and add instead, both recorded.
 *
 * Keyed on the line by the caller, so every field seeds from props at mount.
 */
export function EditOrderLineDialog({
  open,
  orderId,
  orderStatus,
  line,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  open: boolean;
  orderId: string;
  orderStatus: OrderStatus;
  line: OrderLine | null;
  /** The order's prevailing currency, for a line that has none yet. */
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const intl = useIntl();
  // Shown the reader's way, 35,0000 in French, and read back the same way.
  const [quantity, setQuantity] = useState(
    line ? formatQuantity(line.quantityOrdered) : '',
  );
  const [price, setPrice] = useState(
    line?.unitPrice ? formatQuantity(line.unitPrice) : '',
  );
  // Set when a number is typed with a thousands separator (ADR-054).
  const [numberError, setNumberError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(line?.currency ?? defaultCurrency);

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
    setNumberError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!line) return;

    const quantityOrdered = toApiDecimal(quantity);
    const unitPrice = price.trim() ? toApiDecimal(price) : '';
    if (quantityOrdered === null || unitPrice === null) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantityOrdered,
          /**
           * Omitted entirely when blank, which leaves the stored price
           * untouched rather than clearing it. There is deliberately no way to
           * un-price a line here: the route has no representation for it, and
           * inventing one from an empty field would make a cleared price
           * indistinguishable from an unchanged one.
           */
          unitPrice: unitPrice || undefined,
          currency: unitPrice ? currency : undefined,
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
        <DialogTitle>{line?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}

            {orderStatus === 'confirmed' && (
              // On a draft this is a correction; here it changes what the
              // supplier was told.
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'orders.lines.confirmedNotice',
                  defaultMessage:
                    'This order has been confirmed. Changing the quantity or price amends what was agreed with the supplier.',
                })}
              </Alert>
            )}

            <TextField
              id="edit-line-quantity"
              label={intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {/* A pair, because neither half is useful alone (ADR-035). */}
            <Stack direction="row" spacing={2}>
              <TextField
                id="edit-line-price"
                label={intl.formatMessage({
                  id: 'orders.unitPrice',
                  defaultMessage: 'Unit price',
                })}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'orders.lines.price.keep',
                  defaultMessage: 'Leave blank to keep the current price.',
                })}
                sx={{ flexGrow: 1 }}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', maxLength: 19 },
                }}
              />

              <CurrencyField
                id="edit-line-currency"
                required={price.trim() !== ''}
                value={currency}
                onChange={setCurrency}
                sx={{ width: 120 }}
              />
            </Stack>
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
