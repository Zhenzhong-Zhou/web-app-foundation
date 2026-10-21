import { Alert, Box, Button } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';
import { useSubmit } from '../lib/use-submit';

/**
 * On every page while a deletion is pending (ADR-069): the day after which
 * the account goes, as the email names it, and the way to keep it. A
 * deletion nobody can see coming is one nobody can stop, and a keep that
 * failed says so rather than leaving the banner to look unchanged.
 */
export function DeletionBanner() {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const { submitting, error, submit } = useSubmit(refresh);
  // What a keep kept, said once it is done rather than the banner just
  // going, as the organization's banner does; the focus the button had,
  // gone with the banner, moves to it.
  const [kept, setKept] = useState<string | null>(null);
  const keptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kept) keptRef.current?.focus();
  }, [kept]);

  if (kept) {
    return (
      <Alert
        ref={keptRef}
        tabIndex={-1}
        severity="success"
        role="status"
        onClose={() => setKept(null)}
      >
        {kept}
      </Alert>
    );
  }

  const due = session?.user.deletionScheduledAt;
  if (!due) return null;
  // Deleted with an organization, as its only member (ADR-070). Working in
  // it, its banner says both and keeps both; anywhere else, this one does.
  const together = session.user.deletionWithOrganization;
  if (together && together.id === session.organization?.id) return null;

  return (
    <Alert
      severity="warning"
      action={
        <Button
          variant="text"
          size="small"
          disabled={submitting}
          onClick={() =>
            void submit(async () => {
              await api('/account/deletion', { method: 'DELETE' });
              setKept(
                together
                  ? intl.formatMessage(
                      {
                        id: 'settings.banner.keptBoth',
                        defaultMessage:
                          'Your account and {organization} are kept.',
                      },
                      { organization: together.name },
                    )
                  : intl.formatMessage({
                      id: 'account.deletion.kept',
                      defaultMessage: 'Your account will not be deleted.',
                    }),
              );
            })
          }
        >
          {together
            ? intl.formatMessage({
                id: 'settings.banner.keepBoth',
                defaultMessage: 'Keep both',
              })
            : intl.formatMessage({
                id: 'account.deletion.keep',
                defaultMessage: 'Keep my account',
              })}
        </Button>
      }
    >
      {together
        ? intl.formatMessage(
            {
              id: 'account.deletion.bannerWith',
              defaultMessage:
                'Your account and {organization} will be deleted after {date}. Until then you can keep both.',
            },
            { date: formatDay(due), organization: together.name },
          )
        : intl.formatMessage(
            {
              id: 'account.deletion.banner',
              defaultMessage:
                'Your account will be deleted after {date}. Until then you can keep it.',
            },
            { date: formatDay(due) },
          )}
      {error && <Box sx={{ mt: 1 }}>{error}</Box>}
    </Alert>
  );
}
