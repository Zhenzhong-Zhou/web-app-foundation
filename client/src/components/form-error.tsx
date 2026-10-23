import { Alert, Box, Button } from '@mui/material';
import { Children, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { reloadPage } from '../version/reload-page';
import { useNewVersion } from '../version/version-check';
import { ReferencesWhole } from './reference';

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
 *
 * Reload joins the way out once the API has refused this tab as outdated
 * and the new version is out (ADR-081): every save it tries is refused
 * from then on, so reloading is the way on, whatever the line says. What
 * was typed stays, for the person to copy first. Not while the new version
 * is still on its way, when a reload would load the same build.
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
  const { outdated, newer } = useNewVersion();
  const reload = outdated && newer;

  return (
    <Alert
      severity="error"
      aria-label={intl.formatMessage({
        id: 'components.formError.label',
        defaultMessage: 'Error',
      })}
    >
      {/* Usually the server's words, a refusal naming SO-DEMO-1 or a SKU:
          their references kept whole by their hyphens (ADR-081). */}
      <span id={id}>
        <ReferencesWhole text={message} />
      </span>
      {/* Only when something is there: several conditional children are an
          array, truthy even when every one is false. */}
      {(Children.toArray(children).length > 0 || reload) && (
        <Box sx={{ mt: 0.5 }}>
          {children}
          {reload && (
            <Button variant="text" color="inherit" onClick={reloadPage}>
              {intl.formatMessage({
                id: 'version.reload',
                defaultMessage: 'Reload',
              })}
            </Button>
          )}
        </Box>
      )}
    </Alert>
  );
}
