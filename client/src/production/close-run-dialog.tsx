import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { LineVariance, OutputVariance, RunDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/** What close reports back: lines off plan, and the yield if it was too. */
export interface CloseResult {
  variances: LineVariance[];
  outputVariance: OutputVariance | null;
}

/**
 * Close: actual quantities per line, then consumption is written.
 *
 * Every line is pre-filled with what was planned, so the only thing to type is
 * what differed. Leaving one alone means "this went as planned", which is what
 * the operator is asserting by closing.
 */
export function CloseRunDialog({
  open,
  run,
  onClose,
  onClosed,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onClosed: (result: CloseResult) => Promise<void> | void;
}) {
  const stocked = run.lines.filter((line) => line.supplyType === 'stocked');

  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(stocked.map((line) => [line.id, line.quantityPlanned])),
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
    },
    { success: 'Run closed' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      const result = await api<CloseResult>(
        `/production-orders/${run.id}/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            lines: stocked
              .filter((line) => amounts[line.id] !== line.quantityPlanned)
              .map((line) => ({
                lineId: line.id,
                quantityConsumed: amounts[line.id],
              })),
          }),
        },
      );

      close();
      await onClosed(result);
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Close this run</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              Enter what was actually used. Anything left as planned is recorded
              as planned.
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell align="right">Planned</TableCell>
                    <TableCell align="right">Actually used</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {stocked.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell align="right">
                        {line.quantityPlanned} {line.unitOfMeasure}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          id={`close-line-${line.id}`}
                          size="small"
                          value={amounts[line.id] ?? ''}
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: 'decimal',
                              maxLength: 19,
                              style: { textAlign: 'right' },
                            },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Over plan is normal and is never refused — the material was
                already used. Anything short stays where it was issued, for a
                person to put away (ADR-032). */}
            <Alert severity="info">
              Using more than planned is fine — the extra is taken from the same
              place the rest came from. Anything left over stays where the run
              is and needs putting away by hand.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Close run"
          pendingLabel="Closing…"
        />
      </form>
    </Dialog>
  );
}
