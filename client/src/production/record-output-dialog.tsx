import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';
import type { Lot, RunDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Output: repeatable, and defaulting to the lot already open on this run.
 *
 * Joining is the default because of how recalls fail. One batch split across
 * two lots means recalling the second leaves the first — the same material —
 * on shelves; two batches merged means recalling one pulls both, which is
 * wasteful and safe (ADR-032).
 */
export function RecordOutputDialog({
  open,
  run,
  onClose,
  onRecorded,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onRecorded: () => Promise<void> | void;
}) {
  const [quantity, setQuantity] = useState('');
  const [lotChoice, setLotChoice] = useState('');
  const [newCode, setNewCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [lots, setLots] = useState<Lot[]>([]);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onRecorded();
    },
    { success: 'Output recorded' },
  );

  /**
   * The run knows its batches only by id. Their codes live on the lots,
   * which are listed per variant — so fetched on open and matched up, rather
   * than widening the run response for one dialog.
   */
  useEffect(() => {
    if (!open || run.outputLots.length === 0) return;

    let ignore = false;

    void api<Lot[]>(`/stock/lots?variantId=${run.outputVariantId}`)
      .then((rows) => {
        if (!ignore) setLots(rows);
      })
      // Silent: without codes the options still work, they just say less.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open, run.outputVariantId, run.outputLots.length]);

  /**
   * "Batch 24-118, expires 10 Oct 2026". Every option used to read "Add to
   * the batch already open", which was fine for one batch and meaningless
   * for two — the choice this field exists for.
   */
  function describeLot(lotId: string): string {
    const lot = lots.find((row) => row.id === lotId);
    if (!lot) return 'An existing batch';

    return lot.expiresAt
      ? `Batch ${lot.code}, expires ${formatDay(lot.expiresAt)}`
      : `Batch ${lot.code}`;
  }

  const openLot = run.outputLots[run.outputLots.length - 1] ?? '';
  const effective = lotChoice || openLot;

  function close() {
    setQuantity('');
    setLotChoice('');
    setNewCode('');
    setExpiresAt('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/production-orders/${run.id}/output`, {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          lotId: effective === 'new' ? undefined : effective || undefined,
          lot:
            effective === 'new' || !openLot
              ? {
                  code: newCode,
                  // As typed, YYYY-MM-DD (ADR-052).
                  expiresAt: expiresAt || undefined,
                }
              : undefined,
        }),
      }),
    );
  }

  const makingNew = effective === 'new' || !openLot;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Record output</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="output-quantity"
              label="Finished this time"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              helperText={`${run.quantityProduced} recorded so far against a plan of ${run.quantityPlanned}.`}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {openLot && (
              <TextField
                id="output-lot"
                label="Batch number"
                select
                fullWidth
                value={effective}
                onChange={(event) => setLotChoice(event.target.value)}
                helperText="Same batch unless this part was genuinely separate."
              >
                {run.outputLots.map((lotId) => (
                  <MenuItem key={lotId} value={lotId}>
                    Add to {describeLot(lotId)}
                  </MenuItem>
                ))}
                <MenuItem value="new">Start a new batch</MenuItem>
              </TextField>
            )}

            {makingNew && (
              <>
                <TextField
                  id="output-lot-code"
                  label="Batch number"
                  required
                  fullWidth
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 64 } }}
                />

                <TextField
                  id="output-expires"
                  label="Expires"
                  type="date"
                  fullWidth
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </>
            )}

            <Typography variant="caption" color="text.secondary">
              The run stays open until you close it, so a batch made over
              several days is recorded a bit at a time.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Record"
          pendingLabel="Recording…"
        />
      </form>
    </Dialog>
  );
}
