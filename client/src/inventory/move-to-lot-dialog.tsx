import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type {
  LotChanged,
  MoveToLotDto,
  MoveToNewLotDto,
  StockPile,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { api } from '../lib/api';
import { toScaled } from '../lib/decimal';
import {
  displayQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { useSubmit } from '../lib/use-submit';
import { displayWithUnit, unitLabel } from '../products/units';
import { LotFields } from './lot-fields';
import {
  chosenExpiry,
  dayFor,
  existingLot,
  expiryKindOf,
  lotErrors,
  type LotInput,
  NO_LOT,
  useItemLots,
} from './lot-input';
import { useLotMessage } from './lot-received';

/** The fields checked on Move to lot, in order: focus goes to the first refused (#310). */
const CHECKED = ['quantity', 'lotCode', 'lotExpiry', 'lotDay', 'note'] as const;
type Checked = (typeof CHECKED)[number];

/**
 * Move to another lot (ADR-094, R20), a lot's Actions for whoever may
 * correct counts: part of the lot at its place into another of the item's
 * lots, one typed or chosen, or a new one, typed or made for us; the
 * stock stays where it is. A new lot starts as the first lot is, its
 * expiry and, for a code made for us, its supplier's lot (E7), to be
 * changed where the stock is really another run. A correction, so a note
 * says why (5a).
 */
export function MoveToLotDialog({
  row,
  onClose,
  onMoved,
}: {
  row: StockPile;
  onClose: () => void;
  /** Moved: the page reads again, both lots open at the place. */
  onMoved: (moved: { variantId: string; locationId: string }) => void;
}) {
  const intl = useIntl();
  // The whole screen on a phone, as #564's dialogs (review 83).
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const { lots, known } = useItemLots(row.variantId);
  const [form, setForm] = useState<{
    quantity: string;
    lot: LotInput;
    note: string;
  }>({
    quantity: '',
    lot: {
      ...NO_LOT,
      supplierLot: row.lotSupplierLot ?? '',
      expiry: expiryKindOf(row),
      expiresAt: row.lotExpiresAt ?? '',
    },
    note: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Checked, string>>>({});
  const controls = {
    quantity: useRef<HTMLInputElement>(null),
    lotCode: useRef<HTMLInputElement>(null),
    lotExpiry: useRef<HTMLInputElement>(null),
    lotDay: useRef<HTMLInputElement>(null),
    note: useRef<HTMLInputElement>(null),
  };
  const sent = useRef({ quantity: '', made: false });
  const message = useLotMessage();
  const can = useCan();
  const navigate = useNavigate();

  const { submitting, error, reset, submit } = useSubmit<LotChanged>(
    (moved) => {
      const words = {
        quantity: sent.current.quantity,
        from: moved.fromLot.code,
        to: moved.toLot.code,
      };
      message(
        moved.needsCost
          ? intl.formatMessage(
              {
                id: 'inventory.moveLot.doneWaiting',
                defaultMessage:
                  'Moved {quantity} from lot {from} to lot {to}. It waits for a cost there, as some of lot {from} does.',
              },
              words,
            )
          : intl.formatMessage(
              {
                id: 'inventory.moveLot.done',
                defaultMessage: 'Moved {quantity} from lot {from} to lot {to}.',
              },
              words,
            ),
        { id: moved.toLot.id, code: moved.toLot.code, made: sent.current.made },
        // Waiting, linked to Stock value's Waiting for a cost for whoever
        // may set one, as Count it in's is (v16's board; review 26).
        moved.needsCost && can('costs.view')
          ? [
              {
                label: intl.formatMessage({
                  id: 'costs.waiting',
                  defaultMessage: 'Waiting for a cost',
                }),
                onClick: () =>
                  void navigate('/costs#costs', { state: OFFER_BACK }),
              },
            ]
          : [],
      );
      close();
      onMoved({ variantId: row.variantId, locationId: row.locationId });
    },
  );

  function close() {
    reset();
    onClose();
  }

  function clearError(...fields: Checked[]) {
    setErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = toApiDecimal(form.quantity);
    const lotFound = lotErrors(form.lot, lots, intl);
    const existing = existingLot(form.lot, lots);
    const found: Partial<Record<Checked, string>> = {
      quantity: !form.quantity.trim()
        ? intl.formatMessage({
            id: 'inventory.receive.quantityMissing',
            defaultMessage: 'Type a quantity.',
          })
        : quantity === null
          ? groupedNumberMessage()
          : // More than the lot holds here, said at the field before the
            // server's general refusal (review 25).
            (toScaled(quantity) ?? 0n) > (toScaled(row.quantity) ?? 0n)
            ? intl.formatMessage(
                {
                  id: 'inventory.moveLot.tooMuch',
                  defaultMessage: 'At most {amount}, what this lot holds here.',
                },
                {
                  amount: displayWithUnit(
                    row.quantity,
                    row.unitOfMeasure,
                    intl,
                  ),
                },
              )
            : undefined,
      // The lot it is in already, as the server says it.
      lotCode:
        lotFound.code ??
        (existing?.id === row.lotId
          ? intl.formatMessage(
              {
                id: 'inventory.moveLot.sameLot',
                defaultMessage:
                  'The stock is in lot {lot} already. Choose another of its lots, or a new one.',
              },
              { lot: row.lotCode },
            )
          : undefined),
      lotExpiry: lotFound.expiry,
      lotDay: lotFound.day,
      note: !form.note.trim()
        ? intl.formatMessage({
            id: 'inventory.moveLot.noteMissing',
            defaultMessage:
              'Say in the note why this stock belongs in another lot.',
          })
        : undefined,
    };
    setErrors(found);
    const first = CHECKED.find((field) => found[field]);
    if (first) {
      controls[first].current?.focus();
      return;
    }
    if (quantity === null) return;

    const expiry = chosenExpiry(form.lot, lots) ?? undefined;
    const expiresAt = dayFor(expiry, form.lot.expiresAt);
    // Made for us, its supplier's lot as the field says, empty to add
    // later; or typed, which takes none (E7).
    const newLot: MoveToNewLotDto = form.lot.made
      ? {
          makeCode: true,
          supplierLot: form.lot.supplierLot.trim(),
          expiry,
          expiresAt,
        }
      : { code: form.lot.code, expiry, expiresAt };
    const body: MoveToLotDto = {
      locationId: row.locationId,
      quantity,
      note: form.note.trim(),
      ...(existing ? { toLotId: existing.id } : { lot: newLot }),
    };
    sent.current = {
      quantity: displayWithUnit(quantity, row.unitOfMeasure, intl),
      made: !existing && form.lot.made,
    };
    void submit(() =>
      api<LotChanged>(`/stock/lots/${row.lotId!}/lot-changes`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
      fullScreen={phone}
    >
      {/* The body scrolls and the buttons stay in view (#564). */}
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <DialogTitle>
          {intl.formatMessage({
            id: 'inventory.moveLot.title',
            defaultMessage: 'Move to another lot',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {/* What it is for, beside Move… in the same menu (review 6). */}
            <Typography variant="body2">
              {intl.formatMessage({
                id: 'inventory.moveLot.intro',
                defaultMessage:
                  'Moves part of this lot into another lot of the item, one it has or a new one. The stock stays where it is.',
              })}
            </Typography>

            {/* Shown rather than chosen, as Move's: the lot and place
                looked at. */}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage(
                {
                  id: 'inventory.move.pileWithLot',
                  defaultMessage:
                    '{sku} · lot {lot} at {location} — {amount} on hand',
                },
                {
                  sku: <Reference>{row.sku}</Reference>,
                  lot: <Reference>{row.lotCode}</Reference>,
                  location: row.locationName ?? '',
                  amount: displayWithUnit(
                    row.quantity,
                    row.unitOfMeasure,
                    intl,
                  ),
                },
              )}
            </Typography>

            <TextField
              id="move-lot-quantity"
              label={intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                clearError('quantity');
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }));
              }}
              inputRef={controls.quantity}
              error={!!errors.quantity}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              helperText={
                errors.quantity ??
                intl.formatMessage(
                  {
                    id: 'inventory.moveLot.quantity.help',
                    defaultMessage: 'In {unit}. At most {amount}.',
                  },
                  {
                    unit: unitLabel(row.unitOfMeasure, intl),
                    amount: displayQuantity(row.quantity),
                  },
                )
              }
            />

            {/* The lot it goes to: one of the item's, by its code, or a new
                one, its Expires starting as this lot's (E7). */}
            <LotFields
              idPrefix="move-lot"
              variantId={row.variantId}
              unitOfMeasure={row.unitOfMeasure}
              lots={lots}
              knowsLots={known}
              value={form.lot}
              onChange={(update) => {
                clearError('lotCode', 'lotExpiry', 'lotDay');
                setForm((current) => ({
                  ...current,
                  lot: update(current.lot),
                }));
              }}
              codeRef={controls.lotCode}
              expiryRef={controls.lotExpiry}
              dayRef={controls.lotDay}
              errors={{
                code: errors.lotCode,
                expiry: errors.lotExpiry,
                day: errors.lotDay,
              }}
              // E7: copied from this lot, and said so (review 27).
              expiryStart={intl.formatMessage({
                id: 'inventory.moveLot.expiryStart',
                defaultMessage: 'Starts as the lot it leaves has it.',
              })}
            />

            <TextField
              id="move-lot-note"
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              required
              fullWidth
              multiline
              value={form.note}
              onChange={(event) => {
                clearError('note');
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }));
              }}
              inputRef={controls.note}
              error={!!errors.note}
              helperText={
                errors.note ??
                intl.formatMessage({
                  id: 'inventory.moveLot.note.help',
                  defaultMessage:
                    'Why this stock belongs in another lot, for whoever traces it later.',
                })
              }
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            {/* What happens to its cost (v15's board; review 23). */}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage({
                id: 'inventory.moveLot.cost',
                defaultMessage:
                  'Its cost moves with it, at this lot’s average. Stock value stays the same.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'inventory.moveLot.action',
            defaultMessage: 'Move to lot',
          })}
          pendingLabel={intl.formatMessage({
            id: 'inventory.moveLot.pending',
            defaultMessage: 'Moving…',
          })}
        />
      </Box>
    </Dialog>
  );
}
