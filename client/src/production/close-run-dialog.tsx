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
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import type { LineVariance, OutputVariance, RunDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { withUnit } from '../products/units';

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
  const intl = useIntl();
  const stocked = run.lines.filter((line) => line.supplyType === 'stocked');

  // Pre-filled the reader's way, 2,5000 in French, and read back the same.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      stocked.map((line) => [line.id, formatQuantity(line.quantityPlanned)]),
    ),
  );
  // Set when an amount is typed with a thousands separator (ADR-054).
  const [numberError, setNumberError] = useState<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
    },
    {
      success: intl.formatMessage({
        id: 'production.closed',
        defaultMessage: 'Run closed',
      }),
    },
  );

  function close() {
    setNumberError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Each amount in the API's form; a line still at its plan is not sent.
    const used = stocked.map((line) => ({
      line,
      quantity: toApiDecimal(amounts[line.id] ?? ''),
    }));
    if (used.some(({ quantity }) => quantity === null)) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(async () => {
      const result = await api<CloseResult>(
        `/production-orders/${run.id}/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            lines: used
              .filter(({ line, quantity }) => quantity !== line.quantityPlanned)
              .map(({ line, quantity }) => ({
                lineId: line.id,
                quantityConsumed: quantity,
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
        <DialogTitle>
          {intl.formatMessage({
            id: 'production.close.title',
            defaultMessage: 'Close this run',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}

            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'production.close.intro',
                defaultMessage:
                  'Enter what was actually used. Anything left as planned is recorded as planned.',
              })}
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'production.component',
                        defaultMessage: 'Component',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'production.status.draft',
                        defaultMessage: 'Planned',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'production.close.used',
                        defaultMessage: 'Actually used',
                      })}
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {stocked.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell align="right">
                        {withUnit(
                          line.quantityPlanned,
                          line.unitOfMeasure,
                          intl,
                        )}
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
              {intl.formatMessage({
                id: 'production.close.overPlan',
                defaultMessage:
                  'Using more than planned is fine — the extra is taken from the same place the rest came from. Anything left over stays where the run is and needs putting away by hand.',
              })}
            </Alert>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'production.close.action',
            defaultMessage: 'Close run',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.closeLine.pending',
            defaultMessage: 'Closing…',
          })}
        />
      </form>
    </Dialog>
  );
}
