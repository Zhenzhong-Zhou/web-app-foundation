import { Button } from '@mui/material';
import { useIntl } from 'react-intl';

import { FormError } from '../components/form-error';

/**
 * An item's recipes that could not be read (useRecipes), said in words
 * with Try again beside them, in Plan a run and Release alike: never taken
 * for an item with no recipe (#290). `id` is the words', for the button
 * the failure keeps off to point at.
 */
export function RecipesFailed({
  id,
  onRetry,
}: {
  id: string;
  onRetry: () => void;
}) {
  const intl = useIntl();

  return (
    <FormError
      id={id}
      message={intl.formatMessage({
        id: 'production.recipesFailed',
        defaultMessage: 'Could not load the item’s recipes.',
      })}
      action={
        <Button variant="text" color="inherit" onClick={onRetry}>
          {intl.formatMessage({
            id: 'common.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      }
    />
  );
}
