import {
  Alert,
  Box,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type { StockPile, UpdateLotDto } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { ExpiryChoice } from './expiry-choice';
import type { ExpiryKind } from './lot-input';

/**
 * Edit lot details (ADR-094): when it expires, one of three (R8); its
 * supplier's lot, for a code made here (R5); its code, when the code was
 * ours to invent; and, for whoever holds stock.lot_made_here, an older
 * code typed up here marked as made here, once (R7).
 *
 * Not a movement. Every other action on a stock row changes a quantity and
 * writes to the ledger; this changes a fact about the lot and writes nothing
 * to it. Recording two adjustment movements to fix a keystroke would invent
 * stock events that never happened, which is exactly the noise that makes a
 * ledger harder to read.
 */
export function EditLotDialog({
  row,
  onClose,
  onSaved,
}: {
  row: StockPile | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const can = useCan();
  const markId = useId();
  const [form, setForm] = useState({
    code: row?.lotCode ?? '',
    supplierLot: row?.lotSupplierLot ?? '',
    expiry: (row?.lotExpiry ??
      (row?.lotExpiresAt ? 'date' : 'none')) as ExpiryKind,
    // YYYY-MM-DD both ways, as the date input wants it (ADR-052).
    expiresAt: row?.lotExpiresAt ?? '',
    madeHere: false,
  });
  const [errors, setErrors] = useState<{ code?: string; day?: string }>({});
  const codeRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'inventory.lot.saved',
        defaultMessage: 'Lot saved',
      }),
    },
  );

  function close() {
    reset();
    onClose();
  }

  /**
   * A printed code is authoritative — on a supplier's box, or on a label
   * already applied to a production run — so renaming the row would make the
   * record disagree with the warehouse. The honest correction there is moving
   * stock between two lots, which leaves a trail. An invented code has no
   * external truth behind it, so a typo is just a typo; and an older one
   * marked as made here in this save is one too (R7).
   *
   * The server refuses the rename either way; this only decides whether to
   * offer a field that would be rejected.
   */
  const madeHere = row?.lotIsAssigned === true || form.madeHere;
  // The mark, offered for a typed code to whoever may give it (R7).
  const mayMark = row?.lotIsAssigned === false && can('stock.lot_made_here');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row?.lotId) return;

    const found = {
      code:
        madeHere && !form.code.trim()
          ? intl.formatMessage({
              id: 'inventory.lot.codeMissing',
              defaultMessage: 'Type the lot’s code.',
            })
          : undefined,
      day:
        form.expiry === 'date' && !form.expiresAt
          ? intl.formatMessage({
              id: 'inventory.lot.dayMissing',
              defaultMessage: 'Type the day the lot expires.',
            })
          : undefined,
    };
    setErrors(found);
    const first = found.code ? codeRef : found.day ? dayRef : null;
    if (first) {
      first.current?.focus();
      return;
    }

    // Each part as it stands: the server changes only what differs, and
    // logs nothing for a save that changes nothing.
    const body: UpdateLotDto = {
      code: madeHere ? form.code : undefined,
      // Empty takes it away again, "Supplier's lot to add" (R5).
      supplierLot: madeHere ? form.supplierLot.trim() : undefined,
      expiry: form.expiry,
      expiresAt: form.expiry === 'date' ? form.expiresAt : undefined,
      madeHere: form.madeHere ? true : undefined,
    };
    void submit(() =>
      api(`/stock/lots/${row.lotId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    );
  }

  return (
    <Dialog
      open={!!row}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      {/* The body scrolls and the buttons stay in view (#564). */}
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <DialogTitle>
          {intl.formatMessage(
            { id: 'inventory.lot.title', defaultMessage: 'Lot {code}' },
            { code: <Reference>{row?.lotCode}</Reference> },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-lot-code"
              label={intl.formatMessage({
                id: 'inventory.lot.number',
                defaultMessage: 'Lot number',
              })}
              required
              fullWidth
              disabled={!madeHere}
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
              inputRef={codeRef}
              error={!!errors.code}
              helperText={
                errors.code ??
                (madeHere
                  ? intl.formatMessage({
                      id: 'inventory.lot.codeEditable',
                      defaultMessage:
                        'Nobody printed this code, so a typo can be corrected here.',
                    })
                  : mayMark
                    ? // Pointed to the mark that lets it be corrected, where
                      // nothing printed it (step 9's refusal).
                      intl.formatMessage({
                        id: 'inventory.lot.codePrintedOrMark',
                        defaultMessage:
                          'Printed on the boxes, so it cannot be renamed. If nothing printed it, tick “We made this code up” below; otherwise move the stock to the correct lot.',
                      })
                    : intl.formatMessage({
                        id: 'inventory.lot.codePrinted',
                        defaultMessage:
                          'Printed on the boxes, so it cannot be renamed. Move the stock to the correct lot instead.',
                      }))
              }
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            {mayMark && (
              <Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.madeHere}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          madeHere: event.target.checked,
                        }))
                      }
                      slotProps={{
                        input: { 'aria-describedby': `${markId}-help` },
                      }}
                    />
                  }
                  label={intl.formatMessage({
                    id: 'inventory.lot.markMadeHere',
                    defaultMessage: 'We made this code up; nothing printed it',
                  })}
                />
                <FormHelperText id={`${markId}-help`} sx={{ mt: 0 }}>
                  {intl.formatMessage({
                    id: 'inventory.lot.markMadeHere.help',
                    defaultMessage:
                      'Its code can then be corrected and its supplier’s lot added. Once saved, it stays marked, in the Activity log.',
                  })}
                </FormHelperText>
              </Box>
            )}

            {madeHere && (
              <TextField
                id="edit-lot-supplier-lot"
                label={intl.formatMessage({
                  id: 'inventory.lot.supplierLot',
                  defaultMessage: 'Supplier’s lot',
                })}
                fullWidth
                value={form.supplierLot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supplierLot: event.target.value,
                  }))
                }
                helperText={intl.formatMessage({
                  id: 'inventory.lot.supplierLot.editHelp',
                  defaultMessage:
                    'As the supplier printed it. Empty, the lot reads “Supplier’s lot to add”.',
                })}
                slotProps={{ htmlInput: { maxLength: 64 } }}
              />
            )}

            <ExpiryChoice
              idPrefix="edit-lot"
              expiry={form.expiry}
              expiresAt={form.expiresAt}
              onChange={(next) => {
                setErrors((current) => ({ ...current, day: undefined }));
                setForm((current) => ({ ...current, ...next }));
              }}
              dayRef={dayRef}
              errors={{ day: errors.day }}
            />

            {/* Not a warning about this dialog — a reminder of what it reaches.
                One lot is one run, wherever its units sit. */}
            <Alert severity="info">
              {intl.formatMessage(
                {
                  id: 'inventory.lot.changesEverywhere',
                  defaultMessage:
                    'This changes the lot everywhere, not only the units at {location}.',
                },
                { location: row?.locationName ?? '' },
              )}
            </Alert>
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
      </Box>
    </Dialog>
  );
}
