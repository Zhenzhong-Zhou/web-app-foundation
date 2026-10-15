import DownloadIcon from '@mui/icons-material/Download';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Member, OrganizationProfile } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { FormError } from '../components/form-error';
import { api, apiUrl } from '../lib/api';
import { formatWhen } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { CloseOrganizationDialog } from './close-organization-dialog';
import {
  dayWithDaysLeft,
  EXPORT_PATH,
  exportedBy,
} from './organization-deletion';

/**
 * The end of the Profile tab, for Owners (ADR-070): everything the
 * organization holds as one download, and closing it, last, apart, and
 * behind a dialog. Hidden from everyone else, who could use neither.
 */
export function ClosingSections({
  organization,
  onChanged,
}: {
  organization: OrganizationProfile;
  /** The organization read again: its last export changed. */
  onChanged: () => void | Promise<void>;
}) {
  const can = useCan();
  const canExport = can('organizations.export');
  const canDelete = can('organizations.delete');

  // A download ends outside the page: read the last export again when the
  // person comes back to it.
  useEffect(() => {
    if (!canExport) return;
    const read = () => void onChanged();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [canExport, onChanged]);

  return (
    <>
      {canExport && <DownloadEverything organization={organization} />}
      {canDelete && <CloseOrganization onChanged={onChanged} />}
    </>
  );
}

function DownloadEverything({
  organization,
}: {
  organization: OrganizationProfile;
}) {
  const intl = useIntl();
  const { session } = useAuth();
  const last = organization.lastExport;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="download-everything"
      sx={{ p: 2 }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" component="h2" id="download-everything">
          {intl.formatMessage({
            id: 'settings.export.title',
            defaultMessage: 'Download everything',
          })}
        </Typography>
        <Typography>
          {intl.formatMessage({
            id: 'settings.export.what',
            defaultMessage:
              'One ZIP with a spreadsheet file for every kind of record: orders, stock and lots, production, invoices and credit notes with their lines and tax, partners, price lists, the audit log. Every uploaded file comes with it, such as the logo and product images.',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.export.who',
            defaultMessage:
              'For your accountant, a year end, or moving to other software. Only Owners can download it, and each download is recorded in History.',
          })}
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Typography variant="body2">
            {last
              ? intl.formatMessage(
                  {
                    id: 'settings.export.last',
                    defaultMessage: 'Last downloaded {when} by {who}',
                  },
                  {
                    when: formatWhen(last.exportedAt),
                    who: exportedBy(intl, last, session?.user.id),
                  },
                )
              : intl.formatMessage({
                  id: 'settings.export.never',
                  defaultMessage: 'Not downloaded yet',
                })}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            href={apiUrl(EXPORT_PATH)}
            download
          >
            {intl.formatMessage({
              id: 'settings.deletion.download',
              defaultMessage: 'Download everything (ZIP)',
            })}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function CloseOrganization({
  onChanged,
}: {
  onChanged: () => void | Promise<void>;
}) {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  // Whether the Owner is alone in it: then the account goes with it.
  const { data: members } = useResource<Member[]>('/users');
  const cancelling = useSubmit(refresh);

  const organization = session?.organization;
  if (!organization) return null;
  const day = organization.deletionScheduledAt;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="close-organization"
      sx={{ p: 2, borderColor: 'error.light' }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" component="h2" id="close-organization">
          {intl.formatMessage({
            id: 'settings.close.title',
            defaultMessage: 'Close this organization',
          })}
        </Typography>

        {day ? (
          <>
            <Typography>
              {organization.deletionStage === 'underWay'
                ? intl.formatMessage(
                    {
                      id: 'settings.close.underWay',
                      defaultMessage:
                        '{organization} is being deleted. The deletion day is over, so it can no longer be cancelled.',
                    },
                    { organization: organization.name },
                  )
                : intl.formatMessage(
                    {
                      id: 'settings.close.scheduled',
                      defaultMessage:
                        'Scheduled to be deleted after {day}. Only an Owner can cancel, until that day is over.',
                    },
                    { day: dayWithDaysLeft(intl, day) },
                  )}
            </Typography>
            {cancelling.error && <FormError message={cancelling.error} />}
            {organization.deletionStage !== 'underWay' && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  disabled={cancelling.submitting}
                  onClick={() =>
                    void cancelling.submit(() =>
                      api('/organization/deletion', { method: 'DELETE' }),
                    )
                  }
                >
                  {intl.formatMessage({
                    id: 'settings.close.cancel',
                    defaultMessage: 'Cancel deletion',
                  })}
                </Button>
              </Box>
            )}
          </>
        ) : (
          <>
            <Typography>
              {intl.formatMessage(
                {
                  id: 'settings.close.what',
                  defaultMessage:
                    '{organization} and everything in it are deleted 30 days after you ask. Until then everyone can keep working as usual. Only an Owner can cancel, until that day is over. Members keep their accounts.',
                },
                { organization: organization.name },
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'settings.close.export',
                defaultMessage:
                  'You’ll be asked to download everything first, since your business keeps its own records.',
              })}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                color="error"
                disabled={members === null}
                onClick={openDialog(() => setOpen(true))}
              >
                {intl.formatMessage({
                  id: 'settings.close.button',
                  defaultMessage: 'Close this organization…',
                })}
              </Button>
            </Box>
          </>
        )}
      </Stack>

      <CloseOrganizationDialog
        open={open}
        alone={members?.length === 1}
        onClose={() => setOpen(false)}
        onScheduled={onChanged}
      />
    </Paper>
  );
}
