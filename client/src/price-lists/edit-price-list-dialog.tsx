import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { PriceList } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Renames or retires a list. Its side and currency are not here: they never
 * change (ADR-049). Retiring stops it pricing new lines; partners that name it
 * fall back to the organization's default, and nothing already priced moves.
 */
export function EditPriceListDialog({
  list,
  onClose,
  onSaved,
}: {
  list: Pick<PriceList, 'id' | 'name' | 'isActive'> | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [isActive, setIsActive] = useState(list?.isActive ?? true);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Price list saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!list) return;

    void submit(() =>
      api(`/price-lists/${list.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), isActive }),
      }),
    );
  }

  return (
    <Dialog
      open={!!list}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit {list?.name}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-price-list-name"
              label="Name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
              }
              label="In use"
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Save"
          pendingLabel="Saving…"
        />
      </form>
    </Dialog>
  );
}
