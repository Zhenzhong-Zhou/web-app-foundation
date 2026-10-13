import { Alert, Box } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

/**
 * The error line above a form's fields.
 *
 * Labelled, because a dialog can hold a second alert — the create-location
 * form warns about what adding a child will do — and two elements with
 * role="alert" and no distinguishing name are announced as an
 * indistinguishable pair. "Error" is generic enough to reuse; the dialog title
 * already says what the person was doing.
 *
 * `children`, when given, goes on its own line under the message: the way
 * out of a refusal, such as a link to the setting that is missing (ADR-061).
 */
export function FormError({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  const intl = useIntl();

  return (
    <Alert
      severity="error"
      aria-label={intl.formatMessage({
        id: 'components.formError.label',
        defaultMessage: 'Error',
      })}
    >
      {message}
      {children && <Box sx={{ mt: 0.5 }}>{children}</Box>}
    </Alert>
  );
}
