import { Button, Paper, Stack, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { PriceListPicker } from './price-list-picker';

/**
 * The sale list for customers with none of their own (ADR-049). No purchase
 * default: a supplier's price is specific to the supplier.
 */
export function DefaultSaleListForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [listId, setListId] = useState(value);

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: 'Default price list saved',
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ defaultSalePriceListId: listId }),
      }),
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Default sale price list
          </Typography>

          {error && <FormError message={error} />}

          <PriceListPicker
            id="organization-default-sale-list"
            label="Default for customers"
            direction="sale"
            value={listId}
            onChange={setListId}
            disabled={readOnly}
            helperText="Used when a customer has no list of their own."
          />

          {!readOnly && (
            <Button
              type="submit"
              disabled={submitting || listId === value}
              sx={{ alignSelf: 'flex-start' }}
            >
              {submitting ? 'Saving…' : 'Save default'}
            </Button>
          )}
        </Stack>
      </form>
    </Paper>
  );
}
