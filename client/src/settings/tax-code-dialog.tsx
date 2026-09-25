import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { TaxCode } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { formatRate } from './tax-rate';

interface ComponentRow {
  name: string;
  rate: string;
}

/**
 * Adds a tax code, or edits one when `taxCode` is given (ADR-046).
 *
 * The taxes are edited as a set and sent whole, which is how the server
 * stores them: a rate that changes by law is a new set of numbers, and an
 * issued invoice keeps its own copy, so nothing already sent moves.
 *
 * No taxes at all is allowed and means Exempt — a code that charges nothing
 * and says so, rather than a blank on the line.
 */
export function TaxCodeDialog({
  open,
  taxCode,
  onClose,
  onSaved,
}: {
  open: boolean;
  taxCode: TaxCode | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const editing = taxCode !== null;

  const [name, setName] = useState(taxCode?.name ?? '');
  const [isActive, setIsActive] = useState(taxCode?.isActive ?? true);
  const [rows, setRows] = useState<ComponentRow[]>(
    taxCode
      ? taxCode.components.map((component) => ({
          name: component.name,
          // Shown as people read it: 5, not 5.0000.
          rate: formatRate(component.rate).slice(0, -1),
        }))
      : [{ name: '', rate: '' }],
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: editing ? 'Tax code saved' : 'Tax code added' },
  );

  function close() {
    reset();
    onClose();
  }

  function updateRow(index: number, field: keyof ComponentRow, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // A row left completely empty is a row the person meant to delete.
    const components = rows
      .filter((row) => row.name.trim() || row.rate.trim())
      .map((row) => ({ name: row.name.trim(), rate: row.rate.trim() }));

    void submit(() =>
      taxCode
        ? api(`/tax-codes/${taxCode.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name, isActive, components }),
          })
        : api('/tax-codes', {
            method: 'POST',
            body: JSON.stringify({ name, components }),
          }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {editing ? 'Edit tax code' : 'Add a tax code'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="tax-code-name"
              label="Name"
              required
              fullWidth
              value={name}
              onChange={(event) => setName(event.target.value)}
              helperText="What the invoice line shows: GST, GST + PST (BC), Exempt."
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <Typography variant="subtitle2">Taxes it charges</Typography>
            <Typography variant="body2" color="text.secondary">
              Each is charged on the same amount. Leave none for a code that
              charges nothing.
            </Typography>

            {rows.map((row, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center' }}
              >
                <TextField
                  label="Tax"
                  size="small"
                  value={row.name}
                  onChange={(event) =>
                    updateRow(index, 'name', event.target.value)
                  }
                  slotProps={{ htmlInput: { maxLength: 50 } }}
                  sx={{ flexGrow: 1 }}
                />
                <TextField
                  label="Rate %"
                  size="small"
                  value={row.rate}
                  onChange={(event) =>
                    updateRow(index, 'rate', event.target.value)
                  }
                  slotProps={{
                    htmlInput: { inputMode: 'decimal', maxLength: 8 },
                  }}
                  sx={{ width: 120 }}
                />
                <IconButton
                  aria-label={`Remove ${row.name || 'this tax'}`}
                  onClick={() =>
                    setRows((current) => current.filter((_, i) => i !== index))
                  }
                >
                  ×
                </IconButton>
              </Stack>
            ))}

            <Button
              variant="text"
              onClick={() =>
                setRows((current) => [...current, { name: '', rate: '' }])
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Add a tax
            </Button>

            {editing && (
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                }
                label="In use — retired codes stay on invoices that used them"
              />
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close}>
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
