import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { Address } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * One dialog for both adding and editing, unlike locations.
 *
 * There the two genuinely differ — create suggests a type from the parent and
 * warns what adding a child will do, edit offers a parent picker that excludes
 * descendants. Here the forms are field-for-field identical, and two files
 * would be one file plus a copy that drifts.
 */
export function AddressDialog({
  partnerId,
  address,
  open,
  onClose,
  onSaved,
}: {
  partnerId: string;
  address: Address | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    label: address?.label ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? 'CA',
    isBilling: address?.isBilling ?? false,
    isShipping: address?.isShipping ?? true,
    isDefault: address?.isDefault ?? false,
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Address saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function update(
    field:
      | 'label'
      | 'line1'
      | 'line2'
      | 'city'
      | 'region'
      | 'postalCode'
      | 'country',
  ) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function toggle(field: 'isBilling' | 'isShipping' | 'isDefault') {
    return (event: { target: { checked: boolean } }) =>
      setForm((current) => ({ ...current, [field]: event.target.checked }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = {
      label: form.label || undefined,
      line1: form.line1,
      line2: form.line2 || undefined,
      city: form.city || undefined,
      region: form.region || undefined,
      postalCode: form.postalCode || undefined,
      country: form.country,
      isBilling: form.isBilling,
      isShipping: form.isShipping,
      isDefault: form.isDefault,
    };

    void submit(() =>
      address
        ? api(`/partners/${partnerId}/addresses/${address.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : api(`/partners/${partnerId}/addresses`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{address ? 'Edit address' : 'Add an address'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="address-label"
              label="Label"
              fullWidth
              value={form.label}
              onChange={update('label')}
              helperText="What you would call it out loud — Head office, Dock 3."
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="address-line1"
              label="Street address"
              autoComplete="address-line1"
              required
              fullWidth
              value={form.line1}
              onChange={update('line1')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="address-line2"
              label="Address line 2"
              autoComplete="address-line2"
              fullWidth
              value={form.line2}
              onChange={update('line2')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                id="address-city"
                label="City"
                autoComplete="address-level2"
                fullWidth
                value={form.city}
                onChange={update('city')}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />

              <TextField
                id="address-region"
                label="Province or state"
                autoComplete="address-level1"
                fullWidth
                value={form.region}
                onChange={update('region')}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                id="address-postal-code"
                label="Postal code"
                autoComplete="postal-code"
                fullWidth
                value={form.postalCode}
                onChange={update('postalCode')}
                slotProps={{ htmlInput: { maxLength: 32 } }}
              />

              <TextField
                id="address-country"
                label="Country"
                autoComplete="country"
                required
                fullWidth
                value={form.country}
                onChange={update('country')}
                helperText="Two letters — CA, US, DE."
                slotProps={{ htmlInput: { maxLength: 2 } }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={form.isShipping}
                  onChange={toggle('isShipping')}
                />
              }
              label="Deliveries go here"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isBilling}
                  onChange={toggle('isBilling')}
                />
              }
              // Both, often. One address usually serves invoices and
              // deliveries, which is why these are two switches rather than
              // one choice.
              label="Invoices go here"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isDefault}
                  onChange={toggle('isDefault')}
                />
              }
              // Turning this on demotes whichever address holds it — handled
              // server-side in one transaction, because the partial unique
              // index makes a second default a constraint violation.
              label="Use this one by default"
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : address ? 'Save' : 'Add address'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
