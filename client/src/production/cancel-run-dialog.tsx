import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { RunDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

export function CancelRunDialog({
  open,
  run,
  onClose,
  onCancelled,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onCancelled: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCancelled();
    },
    { success: 'Run cancelled' },
  );

  function close() {
    setReason('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/production-orders/${run.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    );
  }

  /**
   * Only lines that actually moved something. A stocked line whose source
   * is the run's own location issued nothing (the single-site case), so
   * warning that it stays behind would describe a movement that never
   * happened.
   */
  const issued =
    run.status === 'released' &&
    run.lines.some(
      (line) =>
        line.supplyType === 'stocked' &&
        line.sourceLocationId !== null &&
        line.sourceLocationId !== run.locationId,
    );

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Cancel this run</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {issued && (
              <Alert severity="warning">
                The components already issued stay where the run is. Cancelling
                does not carry them back — somebody has to move them.
              </Alert>
            )}

            <TextField
              id="cancel-reason"
              label="Why"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="The first thing whoever finds the leftover material will ask."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Cancel run"
          pendingLabel="Cancelling…"
          cancelLabel="Keep it"
        />
      </form>
    </Dialog>
  );
}
