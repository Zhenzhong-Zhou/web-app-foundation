import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import type { Location } from './locations-page';

/**
 * Every location that could legally be this one's parent.
 *
 * Descendants are excluded, because moving a location under its own child
 * detaches the whole subtree — every row still present, none reachable from a
 * root. The server refuses it by walking the chain (ADR-024); the picker does
 * the same walk so the option never appears.
 *
 * `type` is not filtered on. It is a label and does not enforce depth, so a
 * shelf directly under a warehouse is a layout, not a mistake.
 */
function eligibleParents(all: Location[], location: Location): Location[] {
  const banned = new Set([location.id]);
  let grew = true;

  // Repeated passes rather than recursion: the list is flat and unordered, so
  // a child can appear before its parent.
  while (grew) {
    grew = false;
    for (const candidate of all) {
      if (candidate.parentId && banned.has(candidate.parentId)) {
        if (!banned.has(candidate.id)) {
          banned.add(candidate.id);
          grew = true;
        }
      }
    }
  }

  return all.filter((candidate) => !banned.has(candidate.id));
}

export function EditLocationDialog({
  location,
  locations,
  onClose,
  onSaved,
}: {
  location: Location | null;
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: location?.name ?? '',
    code: location?.code ?? '',
    parentId: location?.parentId ?? '',
    isAvailable: location?.isAvailable ?? true,
    isActive: location?.isActive ?? true,
  });

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onSaved();
  });

  function close() {
    reset();
    onClose();
  }

  function update(field: 'name' | 'code' | 'parentId') {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;

    void submit(() =>
      api(`/locations/${location.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          code: form.code || undefined,
          // Null rather than undefined: undefined leaves the parent alone,
          // null moves the location to the top level. The DTO distinguishes
          // them and so must this.
          parentId: form.parentId || null,
          isAvailable: form.isAvailable,
          isActive: form.isActive,
        }),
      }),
    );
  }

  /**
   * Remounted per location by the key on the caller, so the form is seeded from
   * props at mount and never needs an effect to resync. Type is absent
   * deliberately: reclassifying a shelf as a warehouse after stock has moved
   * through it would reinterpret every movement that referenced it.
   */
  return (
    <Dialog
      key={location?.id}
      open={!!location}
      onClose={close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit {location?.name}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="edit-location-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="edit-location-code"
              label="Code"
              fullWidth
              value={form.code}
              onChange={update('code')}
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="edit-location-parent"
              label="Inside"
              select
              fullWidth
              value={form.parentId}
              onChange={update('parentId')}
              helperText="Its own descendants are not listed — moving a location inside itself would detach the subtree."
            >
              <MenuItem value="">Top level</MenuItem>
              {location &&
                eligibleParents(locations, location).map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.code ? ` (${candidate.code})` : ''}
                  </MenuItem>
                ))}
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={form.isAvailable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isAvailable: event.target.checked,
                    }))
                  }
                />
              }
              // Named available rather than sellable because raw materials are
              // consumed rather than sold (ADR-024).
              label="Available for picking"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
              }
              // Retired rather than deleted: a location referenced by movement
              // history cannot be removed without inventing gaps in the ledger.
              label="In use"
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
