import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { AddressFields } from '../components/address-fields';
import { addressBody, addressValues } from '../components/address-values';
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
  const [form, setForm] = useState(addressValues(address));

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

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!site) return;

    // Sent whole: a field left blank is cleared, as the PUT says.
    void submit(() =>
      api(`/locations/${site.id}/address`, {
        method: 'PUT',
        body: JSON.stringify(addressBody(form)),
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

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage({
                id: 'locations.address.help',
                defaultMessage:
                  'Purchase orders say to deliver here, and returns are sent back here. Without it, they print the registered address.',
              })}
            </Typography>

            <AddressFields
              idPrefix="site-address"
              value={form}
              onChange={setForm}
            />

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
