import { Alert } from '@mui/material';

/**
 * The error line above a form's fields.
 *
 * Labelled, because a dialog can hold a second alert — the create-location
 * form warns about what adding a child will do — and two elements with
 * role="alert" and no distinguishing name are announced as an
 * indistinguishable pair. "Error" is generic enough to reuse; the dialog title
 * already says what the person was doing.
 */
export function FormError({ message }: { message: string }) {
  return (
    <Alert severity="error" aria-label="Error">
      {message}
    </Alert>
  );
}
