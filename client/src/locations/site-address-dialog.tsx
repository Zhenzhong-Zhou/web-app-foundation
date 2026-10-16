import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/**
 * A site's address (ADR-071): where a purchase order is delivered and an
 * RMA's goods come back. Sent whole, as the registered address is; without
 * one, those documents print the registered address.
 */
export function SiteAddressDialog({
  site,
  onClose,
  onSaved,
}: {
  site: Location | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const address = site?.address ?? null;
  const [form, setForm] = useState({
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'locations.address.saved',
        defaultMessage: 'Address saved',
      }),
    },
  );

  function close() {
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!site) return;

    // Sent whole: a field left blank is cleared, as the PUT says.
    void submit(() =>
      api(`/locations/${site.id}/address`, {
        method: 'PUT',
        body: JSON.stringify({
          line1: form.line1,
          line2: form.line2 || undefined,
          city: form.city || undefined,
          region: form.region || undefined,
          postalCode: form.postalCode || undefined,
          country: form.country,
        }),
      }),
    );
  }

  function remove() {
    if (!site) return;
    void submit(() =>
      api(`/locations/${site.id}/address`, { method: 'DELETE' }),
    );
  }

  return (
    <Dialog
      open={!!site}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage(
            {
              id: 'locations.address.title',
              defaultMessage: 'Address of {name}',
            },
            { name: site?.name },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'locations.address.help',
                defaultMessage:
                  'Purchase orders say to deliver here, and returns are sent back here. Without it, they print the registered address.',
              })}
            </Typography>

            <TextField
              id="site-address-line1"
              label={intl.formatMessage({
                id: 'settings.org.address.line1',
                defaultMessage: 'Address line 1',
              })}
              required
              fullWidth
              value={form.line1}
              onChange={update('line1')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <TextField
              id="site-address-line2"
              label={intl.formatMessage({
                id: 'partners.address.line2',
                defaultMessage: 'Address line 2',
              })}
              fullWidth
              value={form.line2}
              onChange={update('line2')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="site-address-city"
                label={intl.formatMessage({
                  id: 'partners.address.city',
                  defaultMessage: 'City',
                })}
                fullWidth
                value={form.city}
                onChange={update('city')}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                id="site-address-region"
                label={intl.formatMessage({
                  id: 'partners.address.region',
                  defaultMessage: 'Province or state',
                })}
                fullWidth
                value={form.region}
                onChange={update('region')}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="site-address-postal-code"
                label={intl.formatMessage({
                  id: 'partners.address.postalCode',
                  defaultMessage: 'Postal code',
                })}
                fullWidth
                value={form.postalCode}
                onChange={update('postalCode')}
                slotProps={{ htmlInput: { maxLength: 32 } }}
              />
              <TextField
                id="site-address-country"
                label={intl.formatMessage({
                  id: 'partners.address.country',
                  defaultMessage: 'Country',
                })}
                required
                fullWidth
                value={form.country}
                onChange={update('country')}
                helperText={intl.formatMessage({
                  id: 'settings.org.country.help',
                  defaultMessage: 'Two letters: CA, US.',
                })}
                slotProps={{ htmlInput: { maxLength: 2 } }}
              />
            </Stack>

            {address && (
              <Box>
                <Button color="error" onClick={remove} disabled={submitting}>
                  {intl.formatMessage({
                    id: 'locations.address.remove',
                    defaultMessage: 'Remove the address',
                  })}
                </Button>
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'common.save',
            defaultMessage: 'Save',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
