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
import { LotFields } from '../inventory/lot-fields';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  nameAndCode,
  toApiDecimal,
} from '../lib/format';
import type { Location, OrderLine } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';
import { withUnit } from '../products/units';

/**
 * Receiving against one line: a movement and a fulfilment in one transaction
 * (ADR-027).
 *
 * Deliberately close to ReceiveStockDialog and not merged with it. That one
 * picks a variant because nothing has been ordered; here the line already
 * names it, and the quantity is bounded by what was ordered. Merging them
 * would mean a component with two modes and a variant field that is sometimes
 * a choice and sometimes a label. The lot fields are the part that is the
 * same, and those are shared (LotFields).
 */
export function ReceiveLineDialog({
  orderId,
  line,
  locations,
  onClose,
  onReceived,
}: {
  orderId: string;
  line: OrderLine | null;
  locations: Location[];
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const intl = useIntl();
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [form, setForm] = useState({
    locationId: '',
    quantity: '',
    lotCode: '',
    lotExpiresAt: '',
    note: '',
  });

  /**
   * Fetched on open for the same reason as AddOrderLineDialog, and it matters
   * more here: tracksLots decides whether the lot field shows, and a variant
   * switched to lot tracking after the page loaded would otherwise be
   * received without one, then refused by the server.
   */
  const { variants } = useVariants(line !== null);
  const variant = variants.find((row) => row.id === line?.variantId);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onReceived();
    },
    {
      success: intl.formatMessage({
        id: 'orders.status.received',
        defaultMessage: 'Received',
      }),
    },
  );

  function close() {
    setQuantityError(null);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;

    const quantity = toApiDecimal(form.quantity);
    if (quantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId: form.locationId,
          quantity,
          // The lot is created with the movement — it arrives printed on the
          // box, not registered in advance.
          lot: variant?.tracksLots
            ? {
                code: form.lotCode,
                // As typed, YYYY-MM-DD (ADR-052).
                expiresAt: form.lotExpiresAt || undefined,
              }
            : undefined,
          note: form.note || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog
      open={!!line}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            { id: 'orders.receive.title', defaultMessage: 'Receive {sku}' },
            { sku: line?.sku },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              {line &&
                intl.formatMessage(
                  {
                    id: 'orders.receive.soFar',
                    defaultMessage: '{fulfilled} of {ordered} received so far.',
                  },
                  {
                    fulfilled: formatQuantity(line.quantityFulfilled),
                    ordered: formatQuantity(line.quantityOrdered),
                  },
                )}
            </Typography>

            <TextField
              id="receive-line-location"
              label={intl.formatMessage({
                id: 'inventory.into',
                defaultMessage: 'Into',
              })}
              select
              required
              fullWidth
              value={form.locationId}
              onChange={update('locationId')}
              helperText={intl.formatMessage({
                id: 'inventory.leavesOnly',
                defaultMessage:
                  'Only locations that hold stock directly are listed.',
              })}
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {nameAndCode(location.name, location.code)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="receive-line-quantity"
              label={intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                setQuantityError(null);
                update('quantity')(event);
              }}
              error={!!quantityError}
              /**
               * inputMode rather than type="number". A number input coerces,
               * strips leading zeros, and hands back a value the browser has
               * already interpreted — and the server wants the digits as
               * typed (ADR-025).
               */
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              // The limit as a number, not a rule: "up to 111.0000" makes a
              // 1111 look wrong before it is sent. The server's check stays
              // the guarantee; this is only so the typo is visible first.
              helperText={
                quantityError ??
                (line &&
                  intl.formatMessage(
                    {
                      id: 'orders.receive.upTo',
                      defaultMessage: 'Up to {amount} still outstanding.',
                    },
                    {
                      amount: variant
                        ? withUnit(
                            line.quantityOutstanding,
                            variant.unitOfMeasure,
                            intl,
                          )
                        : formatQuantity(line.quantityOutstanding),
                    },
                  ))
              }
            />

            {/* Shown only for a lot-tracked variant, because the server
                refuses a lot on one that is not — and refuses a movement
                without one on a variant that is. */}
            {variant?.tracksLots && (
              <LotFields
                idPrefix="receive-line"
                variantId={variant.id}
                value={{ code: form.lotCode, expiresAt: form.lotExpiresAt }}
                onChange={(lot) =>
                  setForm((current) => ({
                    ...current,
                    lotCode: lot.code,
                    lotExpiresAt: lot.expiresAt,
                  }))
                }
              />
            )}

            <TextField
              id="receive-line-note"
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              fullWidth
              value={form.note}
              onChange={update('note')}
              helperText={intl.formatMessage({
                id: 'orders.receive.note.help',
                defaultMessage:
                  'Damage, a short count, anything the ledger should say.',
              })}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'inventory.receive.action',
            defaultMessage: 'Receive',
          })}
          pendingLabel={intl.formatMessage({
            id: 'inventory.receive.pending',
            defaultMessage: 'Receiving…',
          })}
        />
      </form>
    </Dialog>
  );
}
