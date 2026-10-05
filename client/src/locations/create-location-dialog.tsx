import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { Location } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { LOCATION_TYPES, locationTypeLabel } from './location-types';

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
  const intl = useIntl();
  const suggested = parent ? NEXT_TYPE[parent.type] : 'site';
  const [form, setForm] = useState({ type: suggested, name: '', code: '' });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCreated();
    },
    {
      success: intl.formatMessage({
        id: 'locations.added',
        defaultMessage: 'Location added',
      }),
    },
  );

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
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {parent
            ? intl.formatMessage(
                {
                  id: 'locations.create.titleInside',
                  defaultMessage: 'Add inside {name}',
                },
                { name: parent.name },
              )
            : intl.formatMessage({
                id: 'locations.create.title',
                defaultMessage: 'Add a location',
              })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {/* The refusal the server will give, said before it is given. A
                location holding stock cannot gain children until that stock
                moves down (ADR-024), and being told after typing a name is
                worse than being told before. */}
            {parent && (
              <Alert severity="info">
                {intl.formatMessage(
                  {
                    id: 'locations.create.parentStopsHolding',
                    defaultMessage:
                      '{name} will stop holding stock directly. Anything already there has to move into a child location first.',
                  },
                  { name: parent.name },
                )}
              </Alert>
            )}

            <TextField
              id="location-type"
              label={intl.formatMessage({
                id: 'locations.typeLabel',
                defaultMessage: 'Type',
              })}
              select
              required
              fullWidth
              value={form.type}
              onChange={update('type')}
              helperText={intl.formatMessage({
                id: 'locations.type.help',
                defaultMessage:
                  'A label for reading, not a rule. Depth is not enforced.',
              })}
            >
              {LOCATION_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {locationTypeLabel(type, intl)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="location-name"
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="location-code"
              label={intl.formatMessage({
                id: 'locations.code',
                defaultMessage: 'Code',
              })}
              fullWidth
              value={form.code}
              onChange={update('code')}
              helperText={intl.formatMessage({
                id: 'locations.code.help',
                defaultMessage:
                  'What is on the label — H5, A-01-03. Unique within its parent.',
              })}
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'locations.create.leavesHoldStock',
                defaultMessage:
                  'Stock sits in the places that contain nothing else. A single room is a location in its own right — add bins inside it later if you need them.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'locations.add',
            defaultMessage: 'Add location',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.adding',
            defaultMessage: 'Adding…',
          })}
        />
      </form>
    </Dialog>
  );
}
