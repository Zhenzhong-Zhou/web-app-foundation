import { Alert, Button } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * A list's failed read, above where its rows go (useKeysetList). With
 * `onRetry` when the first page failed and nothing is shown in its place,
 * never an empty state that would say there is nothing (#195); without it
 * when a Load more failed, whose rows stay and whose button asks again.
 */
export function ListError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry?: () => void;
}) {
  const intl = useIntl();

  if (!error) return null;

  return (
    <Alert
      severity="error"
      action={
        onRetry && (
          <Button variant="text" color="inherit" onClick={onRetry}>
            {intl.formatMessage({
              id: 'common.tryAgain',
              defaultMessage: 'Try again',
            })}
          </Button>
        )
      }
    >
      {error}
    </Alert>
  );
}
