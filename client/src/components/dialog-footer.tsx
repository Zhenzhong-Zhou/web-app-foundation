import { Button, DialogActions } from '@mui/material';

/**
 * The foot of a dialog that does one thing: Cancel, and the action, which
 * says what it is doing while it runs ("Add location", then "Adding…").
 *
 * Both buttons are disabled while it runs. Nothing can abort a request once
 * sent, so a Cancel pressed mid-save would close the dialog while the write
 * still landed — a cancel that cancels nothing. 37 of the 46 footers this
 * replaced already said so; nine let Cancel through.
 *
 * The action submits the dialog's form. `onConfirm` is for a dialog with no
 * form, a confirmation, where the button itself is the whole input.
 *
 * `disabled` is the dialog's own reason not to go yet (nothing chosen, a
 * total that does not add up), on top of a save being in flight.
 */
export function DialogFooter({
  submitting,
  onCancel,
  label,
  pendingLabel,
  disabled = false,
  destructive = false,
  cancelLabel = 'Cancel',
  onConfirm,
}: {
  submitting: boolean;
  onCancel: () => void;
  /** What the action does: "Add location". */
  label: string;
  /** What it says while doing it: "Adding…". */
  pendingLabel: string;
  disabled?: boolean;
  /** Red, for an action that cannot be taken back: voiding, deleting. */
  destructive?: boolean;
  /** "Keep it", where Cancel would read as the action. */
  cancelLabel?: string;
  onConfirm?: () => void;
}) {
  return (
    <DialogActions>
      <Button variant="text" onClick={onCancel} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button
        type={onConfirm ? 'button' : 'submit'}
        color={destructive ? 'error' : 'primary'}
        disabled={submitting || disabled}
        onClick={onConfirm}
      >
        {submitting ? pendingLabel : label}
      </Button>
    </DialogActions>
  );
}
