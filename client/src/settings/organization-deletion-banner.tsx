import CloseIcon from '@mui/icons-material/Close';
import { Alert, Box, Button, IconButton, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { localToday } from '../lib/expiry';
import { HIDDEN_DELETION_BANNER } from '../lib/session-keys';
import { useSubmit } from '../lib/use-submit';
import { dayWithDaysLeft, useExportUrl } from './organization-deletion';

/** What this browser hid: whose banner, for which day, until when. */
interface Hidden {
  organizationId: string;
  day: string;
  on: string;
}

function readHidden(): Hidden | null {
  try {
    return JSON.parse(
      localStorage.getItem(HIDDEN_DELETION_BANNER) ?? 'null',
    ) as Hidden | null;
  } catch {
    return null;
  }
}

/**
 * On every page while the organization's deletion is pending (ADR-070), for
 * every member: the day, and for an Owner the export and the cancel; for
 * the only member deleting their account with it, one banner for both.
 *
 * Its × hides it on this device until tomorrow, a convenience that changes
 * nothing for anyone else, so it is kept in the browser. From 7 days
 * before the day it cannot be hidden, nor once the deletion is under way.
 */
export function OrganizationDeletionBanner() {
  const intl = useIntl();
  const can = useCan();
  const { session, refresh } = useAuth();
  const exportUrl = useExportUrl();
  const [hidden, setHidden] = useState(readHidden);
  // What a cancel kept, said once it is done rather than the banner just
  // vanishing (ADR-070, from the walkthrough).
  const [kept, setKept] = useState<string | null>(null);
  const action = useSubmit(refresh);
  const banner = useRef<HTMLDivElement>(null);

  const organization = session?.organization;
  const day = organization?.deletionScheduledAt;

  // Focus follows what changed: to the banner when a deletion has just
  // been scheduled from this page, or to what a cancel kept. Not on a page
  // that merely opens with a deletion pending (WCAG 2.4.3).
  const seen = useRef(day);
  useEffect(() => {
    if (day && !seen.current) banner.current?.focus();
    seen.current = day;
  }, [day]);
  useEffect(() => {
    if (kept) banner.current?.focus();
  }, [kept]);

  if (kept) {
    return (
      <Alert
        ref={banner}
        tabIndex={-1}
        severity="success"
        role="status"
        className="no-print"
        onClose={() => setKept(null)}
      >
        {kept}
      </Alert>
    );
  }
  if (!organization || !day) return null;

  const today = localToday();
  if (
    hidden?.organizationId === organization.id &&
    hidden.day === day &&
    hidden.on === today
  ) {
    return null;
  }

  if (organization.deletionStage === 'underWay') {
    return (
      <Alert ref={banner} tabIndex={-1} severity="error" className="no-print">
        {intl.formatMessage(
          {
            id: 'settings.banner.underWay',
            defaultMessage:
              '{organization} is being deleted. The deletion day is over, so it can no longer be cancelled. Members will be emailed when it’s done.',
          },
          { organization: organization.name },
        )}
      </Alert>
    );
  }

  const when = dayWithDaysLeft(intl, day);
  // The account goes with this organization, as its only member chose.
  const together =
    session.user.deletionWithOrganization?.id === organization.id;
  const isOwner = can('organizations.delete');
  // Hidden for today only while merely scheduled: not in its last week.
  const hideable = organization.deletionStage === 'scheduled';
  const hideLabel = intl.formatMessage({
    id: 'settings.banner.hide',
    defaultMessage: 'Hide for today',
  });

  const hide = () => {
    const next = { organizationId: organization.id, day, on: today };
    try {
      localStorage.setItem(HIDDEN_DELETION_BANNER, JSON.stringify(next));
    } catch {
      // Storage refused: hidden for this page view only.
    }
    setHidden(next);
  };

  const text = together
    ? intl.formatMessage(
        {
          id: 'settings.banner.together',
          defaultMessage:
            'Your account and {organization} will be deleted after {when}. Download everything first if you want a copy.',
        },
        { organization: organization.name, when },
      )
    : isOwner
      ? intl.formatMessage(
          {
            id: 'settings.banner.owner',
            defaultMessage:
              '{organization} will be deleted after {when}. Download everything again before then. Only an Owner can cancel, until that day is over.',
          },
          { organization: organization.name, when },
        )
      : intl.formatMessage(
          {
            id: 'settings.banner.member',
            defaultMessage:
              '{organization} will be deleted after {when}, as an Owner asked. Your account stays; only this membership ends. Ask an Owner if it should be kept.',
          },
          { organization: organization.name, when },
        );

  const keptMessage = together
    ? intl.formatMessage(
        {
          id: 'settings.banner.keptBoth',
          defaultMessage: 'Your account and {organization} are kept.',
        },
        { organization: organization.name },
      )
    : intl.formatMessage(
        {
          id: 'settings.banner.kept',
          defaultMessage: '{organization} will not be deleted.',
        },
        { organization: organization.name },
      );

  return (
    <Alert
      ref={banner}
      tabIndex={-1}
      severity="warning"
      className="no-print"
      action={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {can('organizations.export') && (
            <Button size="small" href={exportUrl} download>
              {intl.formatMessage({
                id: 'settings.export.title',
                defaultMessage: 'Download everything',
              })}
            </Button>
          )}
          {(together || isOwner) && (
            <Button
              size="small"
              disabled={action.submitting}
              onClick={() =>
                void action.submit(async () => {
                  // The account's cancel keeps both when they went together.
                  await api(
                    together ? '/account/deletion' : '/organization/deletion',
                    { method: 'DELETE' },
                  );
                  setKept(keptMessage);
                })
              }
            >
              {together
                ? intl.formatMessage({
                    id: 'settings.banner.keepBoth',
                    defaultMessage: 'Keep both',
                  })
                : intl.formatMessage({
                    id: 'settings.close.cancel',
                    defaultMessage: 'Cancel deletion',
                  })}
            </Button>
          )}
          {hideable && (
            <IconButton
              size="small"
              aria-label={hideLabel}
              title={hideLabel}
              onClick={hide}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      }
    >
      {text}
      {action.error && <Box sx={{ mt: 1 }}>{action.error}</Box>}
    </Alert>
  );
}
