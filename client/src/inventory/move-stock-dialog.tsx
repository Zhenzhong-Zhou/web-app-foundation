import {
  Alert,
  Autocomplete,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { api } from '../lib/api';
import { groupedNumberMessage, nameAndCode, toApiDecimal } from '../lib/format';
import type { Location, Partner, StockRow } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { unitLabel, withUnit } from '../products/units';
import { REASON_DETAILS, reasonDetailLabel } from './movement-reasons';

export type MoveMode = 'ship' | 'sample' | 'transfer' | 'adjust';

/**
 * Four entry points, one form.
 *
 * Receiving is a different shape and has its own dialog: it starts with a box
 * and asks where it goes. These three start from a pile already on a shelf, so
 * the row supplies the variant, the location, and the lot — and what is left
 * differs only in whether there is a destination, a recipient, or a required
 * note. Four forms would be four copies of the same quantity field.
 *
 * The variant and source are shown, not chosen. Picking them again would let
 * someone act on a different pile than the one they were looking at, which is
 * the mistake this shape exists to prevent.
 */
const MODES: Record<
  MoveMode,
  {
    title: MessageDescriptor;
    verb: MessageDescriptor;
    reason: string;
    needsDestination: boolean;
    /** Stock leaves the business: refused from an unavailable location. */
    leaves: boolean;
    /** What the toast says once it has happened. */
    done: MessageDescriptor;
  }
> = {
  ship: {
    ...defineMessages({
      title: { id: 'inventory.move.ship.title', defaultMessage: 'Ship out' },
      verb: { id: 'inventory.move.ship.verb', defaultMessage: 'Ship' },
      done: { id: 'inventory.move.ship.done', defaultMessage: 'Shipped' },
    }),
    reason: 'shipment',
    needsDestination: false,
    leaves: true,
  },
  sample: {
    ...defineMessages({
      title: {
        id: 'inventory.move.sample.title',
        defaultMessage: 'Send a sample',
      },
      verb: { id: 'inventory.move.sample.verb', defaultMessage: 'Send' },
      done: { id: 'inventory.move.sample.done', defaultMessage: 'Sample sent' },
    }),
    reason: 'sample',
    needsDestination: false,
    leaves: true,
  },
  transfer: {
    ...defineMessages({
      title: {
        id: 'inventory.move.transfer.title',
        defaultMessage: 'Move to another location',
      },
      verb: { id: 'inventory.move.transfer.verb', defaultMessage: 'Move' },
      done: {
        id: 'inventory.move.transfer.done',
        defaultMessage: 'Stock moved',
      },
    }),
    reason: 'transfer',
    needsDestination: true,
    leaves: false,
  },
  adjust: {
    ...defineMessages({
      title: {
        id: 'inventory.move.adjust.title',
        defaultMessage: 'Correct the count',
      },
      verb: {
        id: 'inventory.move.adjust.verb',
        defaultMessage: 'Save correction',
      },
      done: {
        id: 'inventory.move.adjust.done',
        defaultMessage: 'Count corrected',
      },
    }),
    reason: 'adjustment',
    needsDestination: false,
    leaves: false,
  },
};

export function MoveStockDialog({
  mode,
  row,
  locations,
  onClose,
  onMoved,
}: {
  mode: MoveMode;
  row: StockRow | null;
  locations: Location[];
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const intl = useIntl();
  const config = MODES[mode];
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);

  const [form, setForm] = useState({
    quantity: '',
    toLocationId: '',
    reasonDetail: 'miscount',
    note: '',
    direction: 'remove',
  });

  /**
   * Who a sample went to — optional, and a partner rather than free text, so
   * a recall can find it (ADR-042). Retired partners are left out: a new
   * sample to a partner you no longer deal with is a mistake worth not
   * offering.
   */
  const [partners, setPartners] = useState<Partner[]>([]);
  const [recipient, setRecipient] = useState<Partner | null>(null);

  useEffect(() => {
    if (!row || mode !== 'sample') return;

    let ignore = false;

    void api<Partner[]>('/partners')
      .then((rows) => {
        if (!ignore) setPartners(rows.filter((partner) => partner.isActive));
      })
      // Silent: without the list the field is empty, and a sample with no
      // recipient is valid.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [row, mode]);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onMoved();
    },
    { success: intl.formatMessage(config.done) },
  );

  function close() {
    setRecipient(null);
    setQuantityError(null);
    setForm({
      quantity: '',
      toLocationId: '',
      reasonDetail: 'miscount',
      note: '',
      direction: 'remove',
    });
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;

    /**
     * An adjustment is the only reason that goes either way: a miscount can
     * reveal more on the shelf than recorded, or less. Everything else has one
     * direction, encoded by which location column is set (ADR-023).
     */
    const adding = mode === 'adjust' && form.direction === 'add';

    // The language's decimal comma becomes the point the API takes; a
    // thousands separator is refused here rather than guessed at (ADR-054).
    const quantity = toApiDecimal(form.quantity);
    if (quantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: row.variantId,
          lotId: row.lotId ?? undefined,
          fromLocationId: adding ? undefined : row.locationId,
          toLocationId: adding
            ? row.locationId
            : form.toLocationId || undefined,
          quantity,
          reason: config.reason,
          reasonDetail: mode === 'adjust' ? form.reasonDetail : undefined,
          recipientPartnerId:
            mode === 'sample' && recipient ? recipient.id : undefined,
          note: mode === 'adjust' ? form.note : form.note || undefined,
        }),
      }),
    );
  }

  // The unit by name, for the quantity's help line; "units" before a pile.
  const unit = row
    ? unitLabel(row.unitOfMeasure, intl)
    : intl.formatMessage({ id: 'inventory.units', defaultMessage: 'units' });

  const elsewhere = locations.filter(
    (location) => location.id !== row?.locationId,
  );

  /**
   * Said before submitting rather than learned from the refusal: a location
   * marked unavailable — a retention bin, a quarantine shelf — holds stock
   * that can be moved but never sent (ADR-042).
   */
  const heldBack =
    config.leaves &&
    locations.some(
      (location) => location.id === row?.locationId && !location.isAvailable,
    );

  return (
    <Dialog
      key={`${mode}:${row?.variantId}:${row?.locationId}:${row?.lotId ?? ''}`}
      open={!!row}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{intl.formatMessage(config.title)}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && (
              <Alert
                severity="error"
                aria-label={intl.formatMessage({
                  id: 'components.formError.label',
                  defaultMessage: 'Error',
                })}
              >
                {error}
              </Alert>
            )}

            {/* Shown rather than chosen: the person is acting on the pile they
                were looking at, and re-picking it invites acting on a
                different one. */}
            {row && (
              <Typography variant="body2" color="text.secondary">
                {row.lotCode
                  ? intl.formatMessage(
                      {
                        id: 'inventory.move.pileWithLot',
                        defaultMessage:
                          '{sku} · lot {lot} at {location} — {amount} on hand',
                      },
                      {
                        sku: row.sku,
                        lot: row.lotCode,
                        location: row.locationName,
                        amount: withUnit(row.quantity, row.unitOfMeasure, intl),
                      },
                    )
                  : intl.formatMessage(
                      {
                        id: 'inventory.move.pile',
                        defaultMessage:
                          '{sku} at {location} — {amount} on hand',
                      },
                      {
                        sku: row.sku,
                        location: row.locationName,
                        amount: withUnit(row.quantity, row.unitOfMeasure, intl),
                      },
                    )}
              </Typography>
            )}

            {heldBack && (
              <Alert severity="warning">
                {intl.formatMessage(
                  {
                    id: 'inventory.move.heldBack',
                    defaultMessage:
                      '{location} is marked not available, so nothing can be sent from it. Move the stock to an available location first.',
                  },
                  { location: row?.locationName },
                )}
              </Alert>
            )}

            {mode === 'sample' && (
              <Autocomplete
                options={partners}
                getOptionLabel={(option) =>
                  nameAndCode(option.name, option.code)
                }
                value={recipient}
                onChange={(_event, value) => setRecipient(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={intl.formatMessage({
                      id: 'inventory.move.givenTo',
                      defaultMessage: 'Given to',
                    })}
                    helperText={intl.formatMessage({
                      id: 'inventory.move.givenTo.help',
                      defaultMessage:
                        'Optional. Recorded so a recall can find it.',
                    })}
                  />
                )}
              />
            )}

            {mode === 'adjust' && (
              <TextField
                id="move-direction"
                label={intl.formatMessage({
                  id: 'inventory.move.shelfHas',
                  defaultMessage: 'The shelf has',
                })}
                select
                required
                fullWidth
                value={form.direction}
                onChange={update('direction')}
              >
                <MenuItem value="remove">
                  {intl.formatMessage({
                    id: 'inventory.move.less',
                    defaultMessage: 'Less than recorded',
                  })}
                </MenuItem>
                <MenuItem value="add">
                  {intl.formatMessage({
                    id: 'inventory.move.more',
                    defaultMessage: 'More than recorded',
                  })}
                </MenuItem>
              </TextField>
            )}

            {config.needsDestination && (
              <TextField
                id="move-destination"
                label={intl.formatMessage({
                  id: 'inventory.move.to',
                  defaultMessage: 'To',
                })}
                select
                required
                fullWidth
                value={form.toLocationId}
                onChange={update('toLocationId')}
                helperText={intl.formatMessage({
                  id: 'inventory.leavesOnly',
                  defaultMessage:
                    'Only locations that hold stock directly are listed.',
                })}
              >
                {elsewhere.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {nameAndCode(location.name, location.code)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="move-quantity"
              label={
                mode === 'adjust'
                  ? intl.formatMessage({
                      id: 'inventory.move.difference',
                      defaultMessage: 'Difference',
                    })
                  : intl.formatMessage({
                      id: 'inventory.quantity',
                      defaultMessage: 'Quantity',
                    })
              }
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                setQuantityError(null);
                update('quantity')(event);
              }}
              error={!!quantityError}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              /**
               * A difference, not a new total. The endpoint takes a delta, and
               * asking for "I counted 45" would mean reading the balance and
               * subtracting — which lands on a different number if anything
               * moves in between. Recorded as an open decision; until it is
               * settled the form asks for what it actually sends.
               */
              helperText={
                quantityError ??
                (mode === 'adjust'
                  ? intl.formatMessage(
                      {
                        id: 'inventory.move.difference.help',
                        defaultMessage:
                          'How many {unit} out, not the new total.',
                      },
                      { unit },
                    )
                  : intl.formatMessage(
                      {
                        id: 'inventory.quantity.inUnit',
                        defaultMessage: 'In {unit}. Up to 4 decimal places.',
                      },
                      { unit },
                    ))
              }
            />

            {mode === 'adjust' && (
              <>
                <TextField
                  id="move-reason-detail"
                  label={intl.formatMessage({
                    id: 'inventory.why',
                    defaultMessage: 'Why',
                  })}
                  select
                  required
                  fullWidth
                  value={form.reasonDetail}
                  onChange={update('reasonDetail')}
                >
                  {REASON_DETAILS.map((detail) => (
                    <MenuItem key={detail} value={detail}>
                      {reasonDetailLabel(detail, intl)}
                    </MenuItem>
                  ))}
                </TextField>

                {/* Required, and the server refuses without it. A receipt
                    explains itself; an adjustment is a person asserting the
                    system is wrong, and a blank one is unauditable
                    (ADR-023). */}
                <TextField
                  id="move-note"
                  label={intl.formatMessage({
                    id: 'inventory.move.whatHappened',
                    defaultMessage: 'What happened',
                  })}
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  value={form.note}
                  onChange={update('note')}
                  helperText={intl.formatMessage({
                    id: 'inventory.move.whatHappened.help',
                    defaultMessage:
                      'Whoever reads this in six months was not there.',
                  })}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </>
            )}

            {mode !== 'adjust' && (
              <TextField
                id="move-note"
                label={intl.formatMessage({
                  id: 'inventory.note',
                  defaultMessage: 'Note',
                })}
                fullWidth
                value={form.note}
                onChange={update('note')}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage(config.verb)}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
          disabled={heldBack}
        />
      </form>
    </Dialog>
  );
}
