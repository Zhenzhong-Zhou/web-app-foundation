import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { OrderDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Confirms before copying, and takes the two fields the copy deliberately
 * does not inherit.
 *
 * A duplicate clears the reference and expected date (ADR-031), which is
 * right — a supplier's PO number belongs to the order it was issued against.
 * But without somewhere to type the new ones, the copy is indistinguishable
 * from its source in a list: same partner, same direction, same quantities,
 * nothing else to tell them apart. Asking here means that gap never opens,
 * and raising a replacement is usually exactly when its PO number is known.
 *
 * Both optional. Duplicating before either is settled is a real case, and the
 * edit form takes them later.
 */
export function DuplicateOrderDialog({
  open,
  order,
  onClose,
  onDuplicated,
}: {
  open: boolean;
  order: OrderDetail;
  onClose: () => void;
  onDuplicated: (newOrderId: string) => void;
}) {
  const intl = useIntl();
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('');

  const { submitting, error, reset, submit } = useSubmit(() => undefined, {
    success: intl.formatMessage({
      id: 'orders.duplicated',
      defaultMessage: 'Order duplicated',
    }),
  });

  function close() {
    setReference('');
    setExpectedAt('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      const { order: copy } = await api<{ order: { id: string } }>(
        `/orders/${order.id}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify({
            reference: reference.trim() || undefined,
            expectedAt: expectedAt || undefined,
          }),
        },
      );

      close();
      onDuplicated(copy.id);
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
            id: 'orders.duplicate.title',
            defaultMessage: 'Duplicate this order',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2">
              {intl.formatMessage(
                {
                  id: 'orders.duplicate.intro',
                  defaultMessage:
                    'A new draft for {partner}, with the same {count, plural, one {item} other {# items}} and quantities. This order is not changed.',
                },
                { partner: order.partnerName, count: order.lines.length },
              )}
            </Typography>

            <TextField
              id="duplicate-reference"
              label={intl.formatMessage({
                id: 'orders.reference',
                defaultMessage: 'Reference',
              })}
              fullWidth
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              helperText={
                order.reference
                  ? intl.formatMessage(
                      {
                        id: 'orders.duplicate.reference.used',
                        defaultMessage:
                          'The original used {reference}. The copy needs its own.',
                      },
                      { reference: order.reference },
                    )
                  : intl.formatMessage({
                      id: 'orders.duplicate.reference.optional',
                      defaultMessage: 'Optional — you can add it later.',
                    })
              }
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="duplicate-expected"
              label={intl.formatMessage({
                id: 'orders.expected',
                defaultMessage: 'Expected',
              })}
              type="date"
              fullWidth
              value={expectedAt}
              onChange={(event) => setExpectedAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            {/* Said plainly because the reference is the field people assume
                carries over, and the consequence — two orders claiming one PO
                number — only shows up at reconciliation. */}
            <Alert severity="info">
              {intl.formatMessage({
                id: 'orders.duplicate.notCopied',
                defaultMessage:
                  "The reference and expected date are not copied. A supplier's PO number belongs to the order it was issued against.",
              })}
            </Alert>

            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'orders.duplicate.advice',
                defaultMessage:
                  'Fix the draft, confirm it, then cancel this one — that way nothing is lost if something goes wrong.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.duplicate.action',
            defaultMessage: 'Duplicate',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.duplicate.pending',
            defaultMessage: 'Duplicating…',
          })}
        />
      </form>
    </Dialog>
  );
}
