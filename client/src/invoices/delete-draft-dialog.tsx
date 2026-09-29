import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/** Deleting a draft is final, but harmless: it has no number to leave a gap. */
export function DeleteDraftDialog({
  invoiceId,
  open,
  onClose,
  onDeleted,
}: {
  invoiceId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { submitting, error, reset, submit } = useSubmit(onDeleted, {
    success: 'Draft deleted',
  });

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Delete this draft?</DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          Nobody outside has seen it, and it has no number yet. The shipment can
          be invoiced again afterwards.
        </DialogContentText>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={close}
        label="Delete draft"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() =>
          void submit(() => api(`/invoices/${invoiceId}`, { method: 'DELETE' }))
        }
      />
    </Dialog>
  );
}
