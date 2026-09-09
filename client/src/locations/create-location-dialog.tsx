import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import type { Location } from './locations-page';

const TYPES = [
  { value: 'site', label: 'Site' },
  { value: 'zone', label: 'Zone' },
  { value: 'aisle', label: 'Aisle' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'bin', label: 'Bin' },
];

/**
 * The type of a location one level down from its parent. A guess, not a rule —
 * `type` is a label and does not enforce depth (ADR-024) — but it is right
 * often enough to save a dropdown interaction, and wrong harmlessly.
 */
const NEXT_TYPE: Record<string, string> = {
  site: 'zone',
  zone: 'aisle',
  aisle: 'shelf',
  shelf: 'bin',
  bin: 'bin',
};

export function CreateLocationDialog({
  open,
  parent,
  onClose,
  onCreated,
}: {
  open: boolean;
  parent: Location | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const suggested = parent ? NEXT_TYPE[parent.type] : 'site';
  const [form, setForm] = useState({ type: suggested, name: '', code: '' });

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onCreated();
  });

  function close() {
    setForm({ type: suggested, name: '', code: '' });
    reset();
    onClose();
  }

  function update(field: 'type' | 'name' | 'code') {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void submit(() =>
      api('/locations', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          code: form.code || undefined,
          parentId: parent?.id,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {parent ? `Add inside ${parent.name}` : 'Add a location'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {/* The refusal the server will give, said before it is given. A
                location holding stock cannot gain children until that stock
                moves down (ADR-024), and being told after typing a name is
                worse than being told before. */}
            {parent && (
              <Alert severity="info">
                {parent.name} will stop holding stock directly. Anything already
                there has to move into a child location first.
              </Alert>
            )}

            <TextField
              id="location-type"
              label="Type"
              select
              required
              fullWidth
              value={form.type}
              onChange={update('type')}
              helperText="A label for reading, not a rule. Depth is not enforced."
            >
              {TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="location-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="location-code"
              label="Code"
              fullWidth
              value={form.code}
              onChange={update('code')}
              helperText="What is on the label — H5, A-01-03. Unique within its parent."
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <Typography variant="caption" color="text.secondary">
              Stock sits in the places that contain nothing else. A single room
              is a location in its own right — add bins inside it later if you
              need them.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add location'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
