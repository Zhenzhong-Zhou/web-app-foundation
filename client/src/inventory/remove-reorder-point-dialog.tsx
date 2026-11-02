import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/**
 * Removing an item's reorder point (ADR-085), which asks first: the item
 * is never low again until one is set, and nothing else changes. From
 * Edit's foot and from a row's menu alike.
 */
export function RemoveReorderPointDialog({
  variantId,
  sku,
  onClose,
  onRemoved,
}: {
  variantId: string;
  sku: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const intl = useIntl();
  const { submitting, error, submit } = useSubmit(onRemoved, {
    success: intl.formatMessage({
      id: 'inventory.reorder.removed',
      defaultMessage: 'Reorder point removed',
    }),
  });

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>
        {intl.formatMessage(
          {
            id: 'inventory.reorder.removeTitle',
            defaultMessage: 'Remove {sku}’s reorder point?',
          },
          { sku },
        )}
      </DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          {intl.formatMessage({
            id: 'inventory.reorder.removeNotice',
            defaultMessage:
              'It will no longer show as low, on Home or in the bell. Its stock and its orders do not change.',
          })}
        </DialogContentText>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={onClose}
        cancelLabel={intl.formatMessage({
          id: 'inventory.reorder.keep',
          defaultMessage: 'Keep it',
        })}
        label={intl.formatMessage({
          id: 'inventory.reorder.remove',
          defaultMessage: 'Remove reorder point',
        })}
        pendingLabel={intl.formatMessage({
          id: 'inventory.reorder.removing',
          defaultMessage: 'Removing…',
        })}
        destructive
        onConfirm={() =>
          void submit(() =>
            api(`/stock/reorder-points/${variantId}`, { method: 'DELETE' }),
          )
        }
      />
    </Dialog>
  );
}
