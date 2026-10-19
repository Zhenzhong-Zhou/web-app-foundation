import { Link, List, ListItem, Stack, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { AuditRecord } from '../api/types.gen';
import { useAuth } from '../auth/use-auth';
import { relativeTime, SEPARATOR } from '../lib/format';

/**
 * Your recent work here (ADR-063): the last 20 things you did, titled
 * apart from your sign-ins, with the way to all of it.
 *
 * `entries` is read by the page, which reads it again after a write in
 * another section (#122); until the first read answers, it is undefined.
 */
export function RecentWork({ entries }: { entries?: AuditRecord[] }) {
  const intl = useIntl();
  const { session } = useAuth();

  if (!session?.organization) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        {intl.formatMessage(
          {
            id: 'account.work.title',
            defaultMessage: 'Your recent work in {organization}',
          },
          { organization: session.organization.name },
        )}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'account.work.intro',
          defaultMessage:
            'The last 20 things you did here. Your sign-ins and password changes are on Your devices.',
        })}
      </Typography>
      {entries?.length === 0 && (
        <Typography color="text.secondary">
          {intl.formatMessage({
            id: 'people.noActivity',
            defaultMessage: 'Nothing yet.',
          })}
        </Typography>
      )}
      {entries && entries.length > 0 && (
        <List dense>
          {entries.map((entry) => (
            <ListItem key={entry.id} disableGutters divider>
              <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                {[entry.actionName, entry.resourceLabel]
                  .filter(Boolean)
                  .join(SEPARATOR)}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ whiteSpace: 'nowrap', pl: 2 }}
              >
                {relativeTime(entry.createdAt)}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
      <Link
        component={RouterLink}
        to="/account/activity"
        sx={{ fontWeight: 600, alignSelf: 'flex-start' }}
      >
        {intl.formatMessage({
          id: 'account.work.seeAll',
          defaultMessage: 'See all your work',
        })}
      </Link>
    </Stack>
  );
}
