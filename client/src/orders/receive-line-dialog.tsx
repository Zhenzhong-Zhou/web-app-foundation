import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Delivery, Location, OrderLine } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { useToast } from '../components/use-toast';
import { stillToCome } from '../inventory/delivery-words';
import { LotFields } from '../inventory/lot-fields';
import { placePaths } from '../inventory/stock-places';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import { useSubmit } from '../lib/use-submit';
import { displayWithUnit, withUnit } from '../products/units';

/** What receiving on a line reads of it: an order's line, or a delivery's. */
type ReceivableLine = Pick<
  OrderLine,
  | 'id'
  | 'variantId'
  | 'sku'
  | 'tracksLots'
  | 'unitOfMeasure'
  | 'quantityOrdered'
  | 'quantityFulfilled'
  | 'quantityOutstanding'
>;

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
  orderNumber,
  line,
  delivery,
  locations,
  tree,
  canSeeLots,
  onClose,
  onReceived,
  onOpenOrder,
}: {
  orderId: string;
  /** Its number, for the confirmation: "… on PO-000009" (55a). */
  orderNumber: string;
  line: ReceivableLine | null;
  /**
   * Opened over Stock for a delivery chosen there (ADR-093, v3): titled
   * for its order, a line naming the supplier and what is still to come
   * and when, the quantity filled with what is still to come.
   */
  delivery?: Delivery;
  locations: Location[];
  /**
   * Every location, the places' parents among them, so each place is
   * listed by its path (#631).
   */
  tree: Location[];
  /** stock.view, from the page: the item's lots already known. */
  canSeeLots: boolean;
  onClose: () => void;
  onReceived: () => Promise<void>;
  /** Over Stock: the confirmation offers Open the order (55a). */
  onOpenOrder?: () => void;
}) {
  const pathOf = useMemo(() => placePaths(tree), [tree]);
  const intl = useIntl();
  const toast = useToast();
  // What the confirmation says, worked out as the receipt is sent.
  const said = useRef('');
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [form, setForm] = useState({
    locationId: '',
    quantity: delivery ? formatQuantity(delivery.line.quantityOutstanding) : '',
    lotCode: '',
    lotExpiresAt: '',
    note: '',
  });

  // The confirmation says what happened (the design language's After
  // saving; 55a), with Open the order over Stock.
  const { submitting, error, reset, submit } = useSubmit(async () => {
    toast(
      said.current,
      onOpenOrder
        ? {
            label: intl.formatMessage({
              id: 'orders.openTheOrder',
              defaultMessage: 'Open the order',
            }),
            onClick: onOpenOrder,
          }
        : undefined,
    );
    close();
    await onReceived();
  });

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
    said.current = intl.formatMessage(
      {
        id: 'orders.receivedOn',
        defaultMessage: 'Received {quantity} of {code} on {order}',
      },
      {
        quantity: displayWithUnit(quantity, line.unitOfMeasure, intl),
        code: line.sku,
        order: orderNumber,
      },
    );

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId: form.locationId,
          quantity,
          // The lot is created with the movement — it arrives printed on the
          // box, not registered in advance.
          lot: line.tracksLots
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
          {delivery
            ? intl.formatMessage(
                {
                  id: 'orders.receive.titleOn',
                  defaultMessage: 'Receive {sku} on {number}',
                },
                {
                  sku: <Reference>{line?.sku}</Reference>,
                  number: <Reference>{delivery.number}</Reference>,
                },
              )
            : intl.formatMessage(
                { id: 'orders.receive.title', defaultMessage: 'Receive {sku}' },
                { sku: <Reference>{line?.sku}</Reference> },
              )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {delivery && (
              <Typography>
                {intl.formatMessage(
                  {
                    id: 'orders.receive.from',
                    defaultMessage: 'From {partner}: {coming}.',
                  },
                  {
                    partner: delivery.partnerName,
                    coming: stillToCome(delivery, intl),
                  },
                )}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                  {pathOf(location.id)}
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
                      amount: withUnit(
                        line.quantityOutstanding,
                        line.unitOfMeasure,
                        intl,
                      ),
                    },
                  ))
              }
            />

            {/* Shown only for a lot-tracked variant, because the server
                refuses a lot on one that is not — and refuses a movement
                without one on a variant that is. The line says which, so
                receiving asks nothing of the catalogue (ADR-080), and a
                variant's tracking never changes once it is made. */}
            {line?.tracksLots && (
              <LotFields
                idPrefix="receive-line"
                variantId={line.variantId}
                knowsLots={canSeeLots}
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
