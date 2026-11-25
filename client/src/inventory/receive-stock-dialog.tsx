import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  Delivery,
  Location,
  RecordedMovementEnvelope,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { PartnerPicker } from '../components/partner-picker';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import { groupedNumberMessage, toApiDecimal } from '../lib/format';
import { usePartners } from '../lib/use-partners';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';
import { displayWithUnit, unitLabel } from '../products/units';
import type { CountInItem } from './count-in-dialog';
import { DeliveryQuestion } from './delivery-question';
import { NOT_ON_AN_ORDER } from './delivery-words';
import { LotFields } from './lot-fields';
import {
  lotErrors,
  lotRequest,
  NO_LOT,
  useFormerCodeRefusal,
  useItemLots,
} from './lot-input';
import { useLotMessage } from './lot-received';
import { reasonDetailLabel, RECEIPT_DETAILS } from './movement-reasons';
import { NoLotLine } from './no-lot-line';
import { placePaths } from './stock-places';
import { useDeliveries } from './use-deliveries';

/** Why there is no order (R11), or Found in a count, which is no receipt (R12). */
type Why = '' | (typeof RECEIPT_DETAILS)[number] | 'found';

const EMPTY = {
  variantId: '',
  why: '' as Why,
  locationId: '',
  quantity: '',
  lot: NO_LOT,
  partnerId: '',
  note: '',
};

/** The fields the form checks itself, in the order they are on screen (#310). */
const CHECKED = [
  'variantId',
  'why',
  'locationId',
  'quantity',
  'lotCode',
  'lotExpiry',
  'lotDay',
] as const;
type Checked = (typeof CHECKED)[number];

/**
 * Receiving, and only receiving. Shipping, transfers, and adjustments go
 * through the same endpoint with a different reason, but they are different
 * jobs done by different people at different moments — one form with a reason
 * dropdown would make every one of them slower to use.
 */
export function ReceiveStockDialog({
  open,
  locations,
  tree,
  defaultLocationId,
  defaultVariantId = '',
  canSeePartners = false,
  counting = false,
  canStartTracking = false,
  onClose,
  onReceived,
  onDelivery,
  onFoundInCount,
}: {
  open: boolean;
  locations: Location[];
  /**
   * Every location, the places' parents among them, so each place is
   * listed by its path (#631).
   */
  tree: Location[];
  defaultLocationId: string;
  /** The item filled in, from an item's Receive stock… (ADR-093 v3). */
  defaultVariantId?: string;
  /** partners.view: From lists who it may have come from (R11, E2). */
  canSeePartners?: boolean;
  /**
   * Count it in… open over this dialog, from Found in a count: closed,
   * focus comes back to Why is there no order? (ADR-094's table).
   */
  counting?: boolean;
  /**
   * products.update and stock.adjust: the line under an item not tracked
   * ends with Start tracking lots… (review 3).
   */
  canStartTracking?: boolean;
  onClose: () => void;
  /** Saved: the page reads again, the item open at its place and lot. */
  onReceived: (received: {
    variantId: string;
    locationId: string;
  }) => Promise<void>;
  /**
   * An order chosen for an item still to come (ADR-093, v3): the screen
   * closes this dialog and opens that order line's own. Given, the dialog
   * asks "Which delivery is this?" before its fields once such an item is
   * chosen; the screen gives it only to a reader who may see orders and
   * receive on them.
   */
  onDelivery?: (delivery: Delivery) => void;
  /**
   * Found in a count (R12): Count it in… with the item and the place
   * chosen here, since found stock is a correction, not a receipt. Given
   * only to whoever may correct counts.
   */
  onFoundInCount?: (item: CountInItem, locationId: string) => void;
}) {
  const pathOf = useMemo(() => placePaths(tree), [tree]);
  const intl = useIntl();
  const [form, setForm] = useState({
    ...EMPTY,
    locationId: defaultLocationId,
    variantId: defaultVariantId,
  });
  /**
   * What the form says under a field it refused: one left empty (#310), or
   * a quantity typed with a thousands separator (ADR-054).
   */
  const [errors, setErrors] = useState<Partial<Record<Checked, string>>>({});
  /**
   * Where focus goes for a field that is missing: its visible control. The
   * Into select's ref is MUI's handle, whose focus() is its box, never its
   * hidden input (#310).
   */
  const controls = {
    why: useRef<{ focus: () => void }>(null),
    locationId: useRef<{ focus: () => void }>(null),
    quantity: useRef<HTMLInputElement>(null),
    lotCode: useRef<HTMLInputElement>(null),
    lotExpiry: useRef<HTMLInputElement>(null),
    lotDay: useRef<HTMLInputElement>(null),
  };
  // Read again once lot tracking starts from the line under the item
  // (review 3), so its lot fields show, what was typed kept.
  const [started, setStarted] = useState(0);
  const {
    variants,
    answered,
    failed: variantsError,
  } = useVariants(open, started);
  // The item's deliveries, once one is chosen (ADR-093, v3).
  const { deliveries, answered: deliveriesAnswered } = useDeliveries(
    open && onDelivery ? form.variantId || null : null,
  );
  // The answer given for an item: a delivery's line, or Not on an order.
  const [answer, setAnswer] = useState<{
    variantId: string;
    value: string;
  } | null>(null);
  // The item Not on an order was confirmed for, whose fields then show.
  const [offOrder, setOffOrder] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const asking =
    !!onDelivery && !!form.variantId && offOrder !== form.variantId;
  // Not yet known whether the item has a delivery: the fields wait.
  const waiting = asking && !deliveriesAnswered;
  const question = asking && deliveriesAnswered && deliveries.length > 0;
  // From an item's own Receive stock…, its one order chosen already.
  const chosenAnswer =
    answer?.variantId === form.variantId
      ? answer.value
      : form.variantId === defaultVariantId && deliveries.length === 1
        ? deliveries[0]!.line.id
        : '';

  const variant = variants.find((item) => item.id === form.variantId);
  const { lots, known } = useItemLots(
    open && variant?.tracksLots ? variant.id : null,
  );
  // From: whoever it came from, retired partners left out (R11, E2).
  // Read once From shows, never while the delivery question stands in
  // the fields' place (review 63).
  const { partners, answered: partnersAnswered } = usePartners(
    open && canSeePartners && !waiting && !question,
  );
  const senders = partners.filter((partner) => partner.isActive);

  // Back from Count it in…: focus on the question it was chosen from.
  const wasCounting = useRef(counting);
  useEffect(() => {
    if (wasCounting.current && !counting) controls.why.current?.focus();
    wasCounting.current = counting;
  });

  // The confirmation says what happened (the design language's After
  // saving; 55a): a receipt here is on no order, and names its lot, a
  // made one with Copy code, and Open the lot (ADR-094, E3).
  const say = useLotMessage();
  const sent = useRef({ quantity: '', made: false });
  const { submitting, error, errorCode, errorDetails, reset, submit } =
    useSubmit<RecordedMovementEnvelope>(async (result) => {
      const { movement, lotCode, needsCost } = result;
      say(
        intl.formatMessage(
          {
            id: 'inventory.receivedOffOrder.done',
            defaultMessage:
              '{lot, select, made {Received {quantity} of {code} with no order, new lot {lotCode}. Write this code on the delivery.} typed {Received {quantity} of {code} with no order, lot {lotCode}.} other {Received {quantity} of {code} with no order.}}{waits, select, true { It waits for a cost.} other {}}',
          },
          {
            lot: lotCode ? (sent.current.made ? 'made' : 'typed') : 'none',
            quantity: sent.current.quantity,
            code: variant?.sku ?? '',
            lotCode,
            waits: String(needsCost),
          },
        ),
        lotCode
          ? { id: movement.lotId, code: lotCode, made: sent.current.made }
          : null,
      );
      const received = {
        variantId: form.variantId,
        locationId: form.locationId,
      };
      close();
      await onReceived(received);
    });
  // Another lot's former code (ADR-094 amended, R11): at the lot's code,
  // with Use {code}.
  const former = useFormerCodeRefusal(
    { error, errorCode, errorDetails, reset },
    controls.lotCode,
  );

  function close() {
    setForm({ ...EMPTY, locationId: defaultLocationId });
    setAnswer(null);
    setOffOrder(null);
    setAnswerError(null);
    setErrors({});
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  // A field's message goes once it changes.
  function clearError(...fields: Checked[]) {
    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(fields.map((field) => [field, undefined])),
    }));
  }

  function focusField(field: Checked) {
    if (field === 'variantId') {
      // The item picker takes no ref; its input carries the picker's id.
      document.getElementById('receive-variant')?.focus();
      return;
    }
    controls[field].current?.focus();
  }

  /**
   * Found in a count is no receipt (R12): Count it in… opens over this
   * dialog with the item and the place, the question left unanswered for
   * when it closes.
   */
  function foundInCount() {
    if (!variant || !onFoundInCount) {
      setErrors((current) => ({
        ...current,
        variantId: intl.formatMessage({
          id: 'inventory.receive.foundNeedsItem',
          defaultMessage: 'Choose the item first, then Found in a count.',
        }),
      }));
      focusField('variantId');
      return;
    }
    onFoundInCount(
      {
        variantId: variant.id,
        sku: variant.sku,
        unitOfMeasure: variant.unitOfMeasure,
        tracksLots: variant.tracksLots,
      },
      form.locationId,
    );
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // The question first: an order goes to its own Receive dialog, Not on
    // an order shows this dialog's fields.
    if (waiting) return;
    if (question) {
      if (!chosenAnswer) {
        setAnswerError(
          intl.formatMessage({
            id: 'inventory.receive.whichMissing',
            defaultMessage: 'Choose the delivery, or Not on an order.',
          }),
        );
        return;
      }
      if (chosenAnswer === NOT_ON_AN_ORDER) {
        setOffOrder(form.variantId);
        return;
      }
      const chosen = deliveries.find(
        (delivery) => delivery.line.id === chosenAnswer,
      );
      if (chosen && onDelivery) {
        close();
        onDelivery(chosen);
      }
      return;
    }

    // The language's decimal comma becomes the point the API takes; a
    // thousands separator is refused here rather than guessed at (ADR-054).
    const quantity = toApiDecimal(form.quantity);

    /**
     * The form checks itself (noValidate): the browser's own check focused
     * the Into select's hidden input and said nothing a screen reader could
     * place (#310). Each empty field says what it needs, in the app's
     * language, and focus goes to the first one's visible control.
     */
    const lotFound = variant?.tracksLots ? lotErrors(form.lot, lots, intl) : {};
    const found: Partial<Record<Checked, string>> = {
      variantId: form.variantId
        ? undefined
        : intl.formatMessage({
            id: 'inventory.receive.itemMissing',
            defaultMessage: 'Choose an item.',
          }),
      why: form.why
        ? undefined
        : intl.formatMessage({
            id: 'inventory.receive.whyMissing',
            defaultMessage: 'Choose why there is no order.',
          }),
      locationId: form.locationId
        ? undefined
        : intl.formatMessage({
            id: 'inventory.receive.locationMissing',
            defaultMessage: 'Choose a location.',
          }),
      quantity: !form.quantity.trim()
        ? intl.formatMessage({
            id: 'inventory.receive.quantityMissing',
            defaultMessage: 'Type a quantity.',
          })
        : quantity === null
          ? groupedNumberMessage()
          : undefined,
      lotCode: lotFound.code,
      lotExpiry: lotFound.expiry,
      lotDay: lotFound.day,
    };
    setErrors(found);

    const first = CHECKED.find((field) => found[field]);
    if (first) {
      focusField(first);
      return;
    }
    // Never null here: its message would have been found first.
    if (quantity === null) return;
    sent.current = {
      quantity: displayWithUnit(quantity, variant?.unitOfMeasure ?? '', intl),
      made: !!variant?.tracksLots && form.lot.made,
    };

    void submit(() =>
      api<RecordedMovementEnvelope>('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: form.variantId,
          toLocationId: form.locationId,
          // Sent as the string the person typed, with only its decimal
          // separator made a point. Number() here would undo the decision
          // numeric(18, 4) exists to enforce (ADR-025).
          quantity,
          reason: 'receipt',
          // Why there is no order, a key the server keeps (R11).
          reasonDetail: form.why,
          recipientPartnerId: form.partnerId || undefined,
          note: (form.why === 'other' && form.note.trim()) || undefined,
          // The lot is created with the movement, and a separate call
          // would leave an orphan whenever this fails.
          lot: variant?.tracksLots ? lotRequest(form.lot, lots) : undefined,
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
      <form noValidate onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'inventory.receive',
            defaultMessage: 'Receive stock',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Another lot's former code is said at the lot's code. */}
            {error && !former.refused && <FormError message={error} />}

            {variantsError && (
              <FormError
                message={intl.formatMessage({
                  id: 'inventory.catalogueFailed',
                  defaultMessage: 'Could not load the catalogue.',
                })}
              />
            )}

            {/* Only once the catalogue has answered: while it loads, an
                empty list says nothing about the products (#250). */}
            {answered && !variantsError && !variants.length && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'inventory.receive.noProducts',
                  defaultMessage:
                    'No items yet. Add one on the Items screen — stock is counted against a variant, so there has to be something to count.',
                })}
              </Alert>
            )}

            {/* Where typing starts, not the dialog itself (#313). */}
            <VariantPicker
              id="receive-variant"
              autoFocus
              label={intl.formatMessage({
                id: 'inventory.item',
                defaultMessage: 'Item',
              })}
              required
              options={variants}
              loading={!answered}
              failed={variantsError}
              value={form.variantId}
              onChange={(variantId) => {
                clearError('variantId');
                setAnswerError(null);
                setForm((current) => ({ ...current, variantId }));
              }}
              error={!!errors.variantId}
              helperText={errors.variantId}
            />

            {question && (
              <DeliveryQuestion
                deliveries={deliveries}
                value={chosenAnswer}
                onChange={(value) => {
                  setAnswerError(null);
                  setAnswer({ variantId: form.variantId, value });
                }}
                error={answerError ?? undefined}
              />
            )}

            {/* The fields once the question is answered, or with none to ask. */}
            {!waiting && !question && (
              <>
                <TextField
                  id="receive-why"
                  label={intl.formatMessage({
                    id: 'inventory.receive.why',
                    defaultMessage: 'Why is there no order?',
                  })}
                  select
                  required
                  fullWidth
                  value={form.why}
                  onChange={(event) => {
                    clearError('why');
                    const why = event.target.value as Why;
                    if (why === 'found') {
                      foundInCount();
                      return;
                    }
                    setForm((current) => ({ ...current, why }));
                  }}
                  inputRef={controls.why}
                  error={!!errors.why}
                  // What it offers, and why Found in a count is no
                  // receipt, as v15's board says (review 36).
                  helperText={
                    errors.why ??
                    (onFoundInCount
                      ? intl.formatMessage({
                          id: 'inventory.receive.why.helpFound',
                          defaultMessage:
                            'Opening stock, Returned, A sample or Other. Found in a count is not a receipt: it opens Count it in…',
                        })
                      : intl.formatMessage({
                          id: 'inventory.receive.why.help',
                          defaultMessage:
                            'Opening stock, Returned, A sample or Other.',
                        }))
                  }
                >
                  {RECEIPT_DETAILS.map((detail) => (
                    <MenuItem key={detail} value={detail}>
                      {reasonDetailLabel(detail, intl)}
                    </MenuItem>
                  ))}
                  {onFoundInCount && (
                    <MenuItem value="found">
                      {intl.formatMessage({
                        id: 'inventory.receive.whyFound',
                        defaultMessage: 'Found in a count',
                      })}
                    </MenuItem>
                  )}
                </TextField>

                <TextField
                  id="receive-location"
                  label={intl.formatMessage({
                    id: 'inventory.into',
                    defaultMessage: 'Into',
                  })}
                  select
                  required
                  fullWidth
                  value={form.locationId}
                  onChange={(event) => {
                    clearError('locationId');
                    update('locationId')(event);
                  }}
                  inputRef={controls.locationId}
                  error={!!errors.locationId}
                  helperText={errors.locationId}
                >
                  {locations.map((location) => (
                    <MenuItem key={location.id} value={location.id}>
                      {pathOf(location.id)}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  id="receive-quantity"
                  label={intl.formatMessage({
                    id: 'inventory.quantity',
                    defaultMessage: 'Quantity',
                  })}
                  required
                  fullWidth
                  inputRef={controls.quantity}
                  value={form.quantity}
                  onChange={(event) => {
                    clearError('quantity');
                    update('quantity')(event);
                  }}
                  /**
                   * inputMode rather than type="number". A number input coerces,
                   * strips leading zeros, and hands back a value the browser has
                   * already interpreted — and the server wants the digits as typed.
                   * inputMode gets the numeric keypad on a phone without any of it.
                   */
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                  error={!!errors.quantity}
                  helperText={
                    errors.quantity ??
                    (variant
                      ? intl.formatMessage(
                          {
                            id: 'inventory.quantity.inUnit',
                            defaultMessage:
                              'In {unit}. Up to 4 decimal places.',
                          },
                          { unit: unitLabel(variant.unitOfMeasure, intl) },
                        )
                      : intl.formatMessage({
                          id: 'inventory.quantity.help',
                          defaultMessage: 'Up to 4 decimal places.',
                        }))
                  }
                />

                {/* Shown only for a lot-tracked variant, because the server refuses
                a lot on one that is not — and refuses a movement without one on
                one that is (ADR-023). The form follows the same rule rather
                than letting someone fill in a field that will be rejected. */}
                {variant?.tracksLots && (
                  <LotFields
                    idPrefix="receive"
                    variantId={variant.id}
                    unitOfMeasure={variant.unitOfMeasure}
                    lots={lots}
                    knowsLots={known}
                    value={form.lot}
                    onChange={(update) => {
                      clearError('lotCode', 'lotExpiry', 'lotDay');
                      // The refusal was of the code sent.
                      former.clear();
                      setForm((current) => ({
                        ...current,
                        lot: update(current.lot),
                      }));
                    }}
                    codeRef={controls.lotCode}
                    expiryRef={controls.lotExpiry}
                    dayRef={controls.lotDay}
                    errors={{
                      code: former.error ?? errors.lotCode,
                      expiry: errors.lotExpiry,
                      day: errors.lotDay,
                    }}
                    refusedFor={former.refusedFor}
                  />
                )}
                {variant && !variant.tracksLots && (
                  <NoLotLine
                    item={{
                      productId: variant.productId,
                      variantId: variant.id,
                      sku: variant.sku,
                      unitOfMeasure: variant.unitOfMeasure,
                    }}
                    mayStart={canStartTracking && variant.type !== 'equipment'}
                    onStarted={() => setStarted((count) => count + 1)}
                  />
                )}

                {canSeePartners && (
                  <PartnerPicker
                    id="receive-from"
                    label={intl.formatMessage({
                      id: 'inventory.receive.from',
                      defaultMessage: 'From',
                    })}
                    options={senders}
                    loading={!partnersAnswered}
                    value={form.partnerId}
                    onChange={(partnerId) =>
                      setForm((current) => ({ ...current, partnerId }))
                    }
                    helperText={intl.formatMessage({
                      id: 'inventory.receive.from.help',
                      defaultMessage:
                        'Optional. Who it came from, so the lot traces to them.',
                    })}
                  />
                )}

                {form.why === 'other' && (
                  <TextField
                    id="receive-note"
                    label={intl.formatMessage({
                      id: 'inventory.note',
                      defaultMessage: 'Note',
                    })}
                    fullWidth
                    multiline
                    value={form.note}
                    onChange={update('note')}
                    helperText={intl.formatMessage({
                      id: 'inventory.receive.note.help',
                      defaultMessage:
                        'Optional. What it was, for whoever reads this later.',
                    })}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                )}
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={
            question
              ? intl.formatMessage({
                  id: 'inventory.receive.continue',
                  defaultMessage: 'Continue',
                })
              : intl.formatMessage({
                  id: 'inventory.receive.action',
                  defaultMessage: 'Receive',
                })
          }
          pendingLabel={intl.formatMessage({
            id: 'inventory.receive.pending',
            defaultMessage: 'Receiving…',
          })}
        />
      </form>
    </Dialog>
  );
}
