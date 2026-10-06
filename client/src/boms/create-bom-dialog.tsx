import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { groupedNumberMessage, toApiDecimal } from '../lib/format';
import type { Bom, ProductLicence } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { licenceStatus } from '../licences/licence-status';

const EMPTY = { outputQuantity: '', licenceId: '', notes: '' };

/**
 * Creates the header. Components are added afterwards, because the first
 * question is how big a batch is and the second is what goes in it — asking
 * both in one form means a dialog that grows a table inside itself.
 *
 * Quantity is sent as a string and never parsed here. A number would go
 * through a double before it left the browser, which is the precision loss
 * ADR-025 chose numeric to avoid.
 */
export function CreateBomDialog({
  open,
  outputVariantId,
  onClose,
  onCreated,
}: {
  open: boolean;
  outputVariantId: string;
  onClose: () => void;
  onCreated: (bomId: string) => Promise<void> | void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);

  /**
   * What the formulation is registered under — an NPN for a natural health
   * product, blank for anything unregulated. Only current licences are
   * offered: a withdrawn one stays on the recipes already made under it, but
   * nothing new should be started against it.
   */
  const [licences, setLicences] = useState<ProductLicence[]>([]);

  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void api<ProductLicence[]>('/product-licences')
      .then((rows) => {
        // Expired counts as unusable too, without anyone having flipped the
        // withdrawn switch.
        if (!ignore)
          setLicences(rows.filter((row) => licenceStatus(row).usable));
      })
      // Silent: without the list the field is empty, and a recipe with no
      // licence is valid.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open]);

  /**
   * A ref, not state. `useSubmit` captures its callback at render time, so a
   * value written by `setState` during submit is not visible to the `onDone`
   * that runs immediately afterwards — it would read the previous render's
   * null and skip the reload entirely. A ref is the same object across both.
   */
  const createdId = useRef<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      const bomId = createdId.current;
      close();
      if (bomId) await onCreated(bomId);
    },
    {
      success: intl.formatMessage({
        id: 'boms.created',
        defaultMessage: 'Recipe created',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    createdId.current = null;
    setQuantityError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const outputQuantity = toApiDecimal(form.outputQuantity);
    if (outputQuantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(async () => {
      const { bom } = await api<{ bom: Bom }>('/boms', {
        method: 'POST',
        body: JSON.stringify({
          outputVariantId,
          outputQuantity,
          licenceId: form.licenceId || undefined,
          notes: form.notes || undefined,
        }),
      });

      createdId.current = bom.id;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'boms.new',
            defaultMessage: 'New recipe',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="bom-output-quantity"
              label={intl.formatMessage({
                id: 'boms.makesPerBatch',
                defaultMessage: 'Makes per batch',
              })}
              required
              fullWidth
              value={form.outputQuantity}
              onChange={(event) => {
                setQuantityError(null);
                setForm((current) => ({
                  ...current,
                  outputQuantity: event.target.value,
                }));
              }}
              error={!!quantityError}
              helperText={
                quantityError ??
                intl.formatMessage({
                  id: 'boms.makesPerBatch.help',
                  defaultMessage:
                    'How many this recipe produces in one run — 1000, not 1.',
                })
              }
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {licences.length > 0 && (
              <TextField
                id="bom-licence"
                label={intl.formatMessage({
                  id: 'boms.licence',
                  defaultMessage: 'Licence',
                })}
                select
                fullWidth
                value={form.licenceId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    licenceId: event.target.value,
                  }))
                }
                helperText={intl.formatMessage({
                  id: 'boms.licence.helpNew',
                  defaultMessage:
                    'What this formulation is registered under. Leave blank if it is not.',
                })}
              >
                <MenuItem value="">
                  {intl.formatMessage({
                    id: 'boms.licence.none',
                    defaultMessage: 'Not registered',
                  })}
                </MenuItem>
                {licences.map((licence) => (
                  <MenuItem key={licence.id} value={licence.id}>
                    {[licence.number, licence.authority].join(' — ')}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="bom-notes"
              label={intl.formatMessage({
                id: 'boms.notes',
                defaultMessage: 'Notes',
              })}
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            {/* Stated because the alternative — entering per-unit amounts —
                is what people reach for, and it forces a division that
                reappears as stock drift (ADR-029). */}
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'boms.batchAmountsNote',
                defaultMessage:
                  'Enter batch amounts, not amounts per unit. Starts as a draft: add components, then promote it.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'boms.createDraft',
            defaultMessage: 'Create draft',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.shipments.creatingInvoice',
            defaultMessage: 'Creating…',
          })}
        />
      </form>
    </Dialog>
  );
}
