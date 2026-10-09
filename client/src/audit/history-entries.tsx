import {
  Alert,
  Box,
  Divider,
  Link,
  List,
  ListItem,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { LoadMoreButton } from '../components/load-more-button';
import { PersonAvatar } from '../components/person-avatar';
import {
  formatMoment,
  formatWhen,
  relativeTime,
  SEPARATOR,
} from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { type AuditRecord, describe, summarise } from './audit-format';

/** A screen's worth. The full log is one link away for anything longer. */
const PAGE_SIZE = 20;

/**
 * One record's recent changes, newest first, with Load more and the way out
 * to the audit log. Shared by the History drawer and, on a record shown in
 * tabs, its History tab (ADR-055), so the two read the same.
 *
 * Fetched on every mount rather than kept: the likeliest reason to open it
 * is having just changed something, and a cached history would not include
 * it.
 */
export function HistoryEntries({ resourceId }: { resourceId: string }) {
  const intl = useIntl();
  const query = new URLSearchParams({
    resourceId,
    limit: String(PAGE_SIZE),
  });

  const { entries, error, loading, hasMore, loadingMore, loadMore } =
    useKeysetList<AuditRecord>(`/audit?${query.toString()}`);
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack sx={{ flexGrow: 1, minHeight: 0 }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}

        {loading && showSkeleton && <Skeleton height={160} />}

        {entries?.length === 0 && (
          // Not an error. Changes made before auditing covered this record,
          // or before its variant and receipt events were keyed to it, have
          // no rows here.
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {intl.formatMessage({
              id: 'audit.history.empty',
              defaultMessage: 'No recorded changes.',
            })}
          </Typography>
        )}

        {!!entries?.length && (
          <List disablePadding>
            {entries.map((entry) => (
              <ListItem
                key={entry.id}
                disableGutters
                divider
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  py: 1.25,
                }}
              >
                {/* Who, as a face (ADR-063). */}
                <PersonAvatar
                  userId={entry.actorId}
                  name={entry.actorName ?? null}
                  email={entry.actorEmail}
                  photoFileId={entry.actorPhotoFileId}
                  size={28}
                />
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="body2">
                    {describe(entry.action)}
                  </Typography>

                  {summarise(entry.payload) && (
                    <Typography variant="body2" color="text.secondary">
                      {summarise(entry.payload)}
                    </Typography>
                  )}

                  {/* Who, by name with the email cut short, and when, to the
                    minute and how long ago (ADR-063). A tombstoned actor
                    keeps its id and loses its email (ADR-012). */}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    title={entry.actorEmail ?? undefined}
                    sx={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {[entry.actorName, entry.actorEmail]
                      .filter(Boolean)
                      .join(SEPARATOR) ||
                      intl.formatMessage({
                        id: 'audit.removedAccount',
                        defaultMessage: 'A removed account',
                      })}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    title={formatMoment(entry.createdAt)}
                    sx={{ display: 'block' }}
                  >
                    {[
                      formatWhen(entry.createdAt),
                      relativeTime(entry.createdAt),
                    ].join(SEPARATOR)}
                  </Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        )}

        <LoadMoreButton
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={loadMore}
          sx={{ mt: 1 }}
        />
      </Box>

      <Divider />

      {/* The way out to the tools this deliberately leaves out: dates,
          actions, IPs, everything else in the organization. */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Link
          component={RouterLink}
          to={`/audit?${new URLSearchParams({ resourceId }).toString()}`}
          variant="body2"
          underline="hover"
        >
          {intl.formatMessage({
            id: 'audit.history.openInLog',
            defaultMessage: 'Open in audit log',
          })}
        </Link>
      </Box>
    </Stack>
  );
}
