import { Alert, Box } from '@mui/material';
import { Children, type ReactNode } from 'react';
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
 *
 * `id` goes on the message itself, not the alert, for a field to point at
 * with aria-describedby (#120): the alert's own label, "Error", would be
 * read as the description instead of the words.
 */
export function FormError({
  message,
  children,
  id,
}: {
  message: string;
  children?: ReactNode;
  id?: string;
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
      <span id={id}>{message}</span>
      {/* Only when something is there: several conditional children are an
          array, truthy even when every one is false. */}
      {Children.toArray(children).length > 0 && (
        <Box sx={{ mt: 0.5 }}>{children}</Box>
      )}
    </Alert>
  );
}
