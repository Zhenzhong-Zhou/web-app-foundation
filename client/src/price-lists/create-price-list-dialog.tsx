import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { PriceListDirection } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * A new list (ADR-049). Direction and currency are chosen here and never
 * changed afterwards — either would reinterpret every price on the list — so
 * the dialog says so rather than letting it be discovered.
 */
export function CreatePriceListDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (priceListId: string) => void;
}) {
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<PriceListDirection>('sale');
  const [currency, setCurrency] = useState('');

  // useSubmit's callback takes no result, so the new id waits here.
  const createdId = useRef<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    () => {
      const id = createdId.current;
      close();
      if (id) onCreated(id);
    },
    { success: 'Price list created' },
  );

  function close() {
    setName('');
    setDirection('sale');
    setCurrency('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      const response = await api<{ priceList: { id: string } }>(
        '/price-lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            direction,
            currency: currency.trim().toUpperCase(),
          }),
        },
      );
      createdId.current = response.priceList.id;
    });
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>New price list</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="price-list-name"
              label="Name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText="As people will pick it: Wholesale CAD, Cascade USD."
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="price-list-direction"
              select
              label="Prices"
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as PriceListDirection)
              }
            >
              <MenuItem value="sale">What customers pay</MenuItem>
              <MenuItem value="purchase">What a supplier charges</MenuItem>
            </TextField>

            <TextField
              id="price-list-currency"
              label="Currency"
              required
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              helperText="Every price on the list is in it. Neither this nor the side above can change later."
              slotProps={{ htmlInput: { maxLength: 3 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
