import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

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
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Delete this draft?</DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText>
          Nobody outside has seen it, and it has no number yet. The shipment can
          be invoiced again afterwards.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={close}>
          Cancel
        </Button>
        <Button
          color="error"
          disabled={submitting}
          onClick={() =>
            void submit(() =>
              api(`/invoices/${invoiceId}`, { method: 'DELETE' }),
            )
          }
        >
          {submitting ? 'Deleting…' : 'Delete draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
