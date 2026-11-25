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

import type {
  Delivery,
  Location,
  OrderLine,
  ReceiptEnvelope,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { stillToCome } from '../inventory/delivery-words';
import { LotFields } from '../inventory/lot-fields';
import {
  type LotErrors,
  lotErrors,
  lotRequest,
  NO_LOT,
  useFormerCodeRefusal,
  useItemLots,
} from '../inventory/lot-input';
import { useLotMessage } from '../inventory/lot-received';
import { NoLotLine } from '../inventory/no-lot-line';
import { placePaths } from '../inventory/stock-places';
import { api } from '../lib/api';
import {
  displayQuantity,
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import { useSubmit } from '../lib/use-submit';
import { displayWithUnit } from '../products/units';

/** What receiving on a line reads of it: an order's line, or a delivery's. */
type ReceivableLine = Pick<
  OrderLine,
  | 'id'
  | 'variantId'
  | 'productId'
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
  canStartTracking = false,
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
  /**
   * products.update and stock.adjust: the line under an item not tracked
   * ends with Start tracking lots… (review 3).
   */
  canStartTracking?: boolean;
  onClose: () => void;
  /** Saved: the page reads again, over Stock the item open at its place. */
  onReceived: (received: {
    variantId: string;
    locationId: string;
  }) => Promise<void>;
  /** Over Stock: the confirmation offers Open the order (55a). */
  onOpenOrder?: () => void;
}) {
  const pathOf = useMemo(() => placePaths(tree), [tree]);
  const intl = useIntl();
  // What the confirmation says, worked out as the receipt is sent.
  const sent = useRef({ quantity: '', made: false });
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [form, setForm] = useState({
    locationId: '',
    quantity: delivery ? formatQuantity(delivery.line.quantityOutstanding) : '',
    lot: NO_LOT,
    note: '',
  });
  // The lot fields' own refusals, each at its field (#310).
  const [lotProblems, setLotProblems] = useState<LotErrors>({});
  const lotControls = {
    code: useRef<HTMLInputElement>(null),
    expiry: useRef<HTMLInputElement>(null),
    day: useRef<HTMLInputElement>(null),
  };
  // Lot tracking started from the line under the item (review 3): its lot
  // fields show from then, what was typed kept.
  const [started, setStarted] = useState(false);
  const tracksLots = !!line?.tracksLots || started;
  const { lots, known } = useItemLots(
    line && tracksLots && canSeeLots ? line.variantId : null,
  );

  // The confirmation says what happened (the design language's After
  // saving; 55a): its lot, a made one with Copy code, and Open the lot
  // (ADR-094, E3), with Open the order over Stock.
  const say = useLotMessage();
  const { submitting, error, errorCode, errorDetails, reset, submit } =
    useSubmit<ReceiptEnvelope>(async (result) => {
      const { movement, lotCode, needsCost } = result;
      say(
        intl.formatMessage(
          {
            id: 'orders.receivedOn.done',
            defaultMessage:
              '{lot, select, made {Received {quantity} of {code} on {order}, new lot {lotCode}. Write this code on the delivery.} typed {Received {quantity} of {code} on {order}, lot {lotCode}.} other {Received {quantity} of {code} on {order}.}}{waits, select, true { It waits for a cost.} other {}}',
          },
          {
            lot: lotCode ? (sent.current.made ? 'made' : 'typed') : 'none',
            quantity: sent.current.quantity,
            code: line?.sku ?? '',
            order: orderNumber,
            lotCode,
            waits: String(needsCost),
          },
        ),
        lotCode
          ? { id: movement.lotId, code: lotCode, made: sent.current.made }
          : null,
        onOpenOrder
          ? [
              {
                label: intl.formatMessage({
                  id: 'orders.openTheOrder',
                  defaultMessage: 'Open the order',
                }),
                onClick: onOpenOrder,
              },
            ]
          : [],
      );
      const received = {
        variantId: line?.variantId ?? '',
        locationId: form.locationId,
      };
      close();
      await onReceived(received);
    });
  // Another lot's former code (ADR-094 amended, R11): at the lot's code,
  // with Use {code}.
  const former = useFormerCodeRefusal(
    { error, errorCode, errorDetails, reset },
    lotControls.code,
  );

  function close() {
    setQuantityError(null);
    setLotProblems({});
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

    // The lot's own check, focus on the first it refused (#310).
    if (tracksLots) {
      const found = lotErrors(form.lot, lots, intl);
      setLotProblems(found);
      const first = (['code', 'expiry', 'day'] as const).find(
        (field) => found[field],
      );
      if (first) {
        lotControls[first].current?.focus();
        return;
      }
    }
    sent.current = {
      quantity: displayWithUnit(quantity, line.unitOfMeasure, intl),
      made: tracksLots && form.lot.made,
    };

    void submit(() =>
      api<ReceiptEnvelope>(`/orders/${orderId}/lines/${line.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId: form.locationId,
          quantity,
          // The lot is created with the movement, not registered in
          // advance.
          lot: tracksLots ? lotRequest(form.lot, lots) : undefined,
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
            {/* Another lot's former code is said at the lot's code. */}
            {error && !former.refused && <FormError message={error} />}

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
                    fulfilled: displayQuantity(line.quantityFulfilled),
                    ordered: displayQuantity(line.quantityOrdered),
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
                      amount: displayWithUnit(
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
            {line && !tracksLots && (
              <NoLotLine
                item={{
                  productId: line.productId,
                  variantId: line.variantId,
                  sku: line.sku,
                  unitOfMeasure: line.unitOfMeasure,
                }}
                mayStart={canStartTracking}
                onStarted={() => setStarted(true)}
              />
            )}
            {line && tracksLots && (
              <LotFields
                idPrefix="receive-line"
                variantId={line.variantId}
                unitOfMeasure={line.unitOfMeasure}
                lots={lots}
                knowsLots={known}
                value={form.lot}
                onChange={(update) => {
                  setLotProblems({});
                  // The refusal was of the code sent.
                  former.clear();
                  setForm((current) => ({
                    ...current,
                    lot: update(current.lot),
                  }));
                }}
                codeRef={lotControls.code}
                expiryRef={lotControls.expiry}
                dayRef={lotControls.day}
                errors={{
                  ...lotProblems,
                  code: former.error ?? lotProblems.code,
                }}
                refusedFor={former.refusedFor}
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
