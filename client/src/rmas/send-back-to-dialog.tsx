import { Dialog, DialogContent, DialogTitle, Stack } from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Location, ReturnAuthorizationDetail } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { api, messageFor } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { SiteSelect } from '../locations/site-select';

/**
 * Where an RMA's goods come back to (ADR-071, amended): one of the
 * organization's sites, or none, so the RMA prints the registered address.
 * The one thing on an RMA that changes after it is raised; the server
 * allows it while the RMA is open and goods are expected.
 *
 * Keyed by the caller on the RMA's current site, so the choice seeds from
 * props when it opens and never needs an effect to resync.
 *
 * A reader who may change the RMA but not see locations (ADR-080), as
 * Finance, is not sent to ask for them: the field says why it cannot be
 * changed, and there is nothing to save.
 */
export function SendBackToDialog({
  open,
  rma,
  canSeeLocations,
  onClose,
  onSaved,
}: {
  open: boolean;
  rma: ReturnAuthorizationDetail;
  /** locations.view, from the page. */
  canSeeLocations: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [siteId, setSiteId] = useState(rma.sendBackTo?.id ?? '');
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The RMA's page has no locations of its own; read when first opened.
  useEffect(() => {
    if (!open || !canSeeLocations) return;

    let ignore = false;

    void api<Location[]>('/locations')
      .then((rows) => {
        if (!ignore) setLocations(rows);
      })
      .catch((caught: unknown) => {
        if (!ignore) setLoadError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [open, canSeeLocations]);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'rmas.sendBackTo.saved',
        defaultMessage: 'Send back to saved',
      }),
    },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void submit(() =>
      api(`/return-authorizations/${rma.id}`, {
        method: 'PATCH',
        // Null for none: the RMA then prints the registered address.
        body: JSON.stringify({ sendBackToId: siteId || null }),
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
          {intl.formatMessage(
            {
              id: 'rmas.sendBackTo.title',
              defaultMessage: 'Where {number} comes back to',
            },
            { number: <Reference>{rma.number}</Reference> },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(error ?? loadError) && (
              <FormError message={(error ?? loadError)!} />
            )}

            <SiteSelect
              id="rma-send-back-to"
              label={intl.formatMessage({
                id: 'rmas.sendBackTo',
                defaultMessage: 'Send back to',
              })}
              value={siteId}
              onChange={setSiteId}
              locations={locations}
              current={rma.sendBackTo}
              unreadable={!canSeeLocations}
              emptyLabel={intl.formatMessage({
                id: 'rmas.sendBackTo.none',
                defaultMessage: 'Not chosen',
              })}
              emptyHelp={intl.formatMessage({
                id: 'rmas.sendBackTo.noneHelp',
                defaultMessage: 'The RMA prints the registered address.',
              })}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          disabled={!canSeeLocations}
          // The field's own words say why (SiteSelect).
          describedBy={
            canSeeLocations ? undefined : 'rma-send-back-to-helper-text'
          }
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
