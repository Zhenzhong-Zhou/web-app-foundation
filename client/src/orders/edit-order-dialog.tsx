import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Location, OrderDetail } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { SiteSelect } from '../locations/site-select';

/**
 * The header fields that can change after an order exists.
 *
 * Deliver to (ADR-071, amended) only on a purchase still to come in: a
 * received order's goods have arrived and a cancelled one's never will, so
 * the server refuses it there and the field is not offered.
 *
 * `partnerId` and `direction` are absent because both are settled at creation:
 * changing either once lines exist reinterprets every line and every movement
 * that referenced the order, which is the same reasoning that keeps `type` off
 * a product (ADR-023). An order sent to the wrong supplier is duplicated to
 * the right one, not edited.
 *
 * Offered at every status, not only on drafts. A supplier's PO number often
 * arrives after the order was confirmed, and a note about a late delivery is
 * worth adding to a received one — the server places no status restriction on
 * these, so neither does this.
 *
 * Keyed on the order id by the caller, so the fields seed from props at mount
 * and never need an effect to resync.
 */
export function EditOrderDialog({
  open,
  order,
  locations,
  canSeeLocations,
  onClose,
  onSaved,
}: {
  open: boolean;
  order: OrderDetail;
  /** The organization's locations, for Deliver to; only sites are offered. */
  locations: Location[];
  /** locations.view, from the page: without it Deliver to says why. */
  canSeeLocations: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [reference, setReference] = useState(order.reference ?? '');
  const [deliverTo, setDeliverTo] = useState(order.deliverTo?.id ?? '');
  const choosesSite =
    order.direction === 'purchase' &&
    (order.status === 'draft' || order.status === 'confirmed');
  const [note, setNote] = useState(order.note ?? '');

  // YYYY-MM-DD both ways, as the date input wants it (ADR-052).
  const [expectedAt, setExpectedAt] = useState(order.expectedAt ?? '');

  const intl = useIntl();
  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'orders.saved',
        defaultMessage: 'Order saved',
      }),
    },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          /**
           * Empty strings rather than undefined, so clearing a field actually
           * clears it. undefined would be dropped by JSON.stringify and the
           * old value would survive a deliberate deletion.
           */
          reference: reference.trim(),
          note: note.trim(),
          expectedAt: expectedAt || undefined,
          // Only when changed, and null for none (ADR-071, amended).
          deliverToId:
            choosesSite && deliverTo !== (order.deliverTo?.id ?? '')
              ? deliverTo || null
              : undefined,
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
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'orders.edit.title',
            defaultMessage: 'Edit order',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="order-reference"
              label={intl.formatMessage({
                id: 'orders.reference',
                defaultMessage: 'Reference',
              })}
              fullWidth
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              helperText={intl.formatMessage({
                id: 'orders.edit.reference.help',
                defaultMessage:
                  "The supplier's PO number, or your own. Shown in the orders list.",
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="order-expected"
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

            {choosesSite && (
              <SiteSelect
                id="order-deliver-to"
                label={intl.formatMessage({
                  id: 'orders.deliverTo',
                  defaultMessage: 'Deliver to',
                })}
                value={deliverTo}
                onChange={setDeliverTo}
                locations={locations}
                current={order.deliverTo}
                unreadable={!canSeeLocations}
                emptyLabel={intl.formatMessage({
                  id: 'orders.deliverTo.none',
                  defaultMessage: 'Not chosen',
                })}
                emptyHelp={intl.formatMessage({
                  id: 'orders.deliverTo.noneHelp',
                  defaultMessage:
                    'The purchase order prints the registered address.',
                })}
              />
            )}

            <TextField
              id="order-note"
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              fullWidth
              multiline
              minRows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'orders.edit.fixed',
                defaultMessage:
                  'The supplier and direction cannot change — every line and every receipt is recorded against them. Duplicate the order instead.',
              })}
            </Typography>
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
      </form>
    </Dialog>
  );
}
