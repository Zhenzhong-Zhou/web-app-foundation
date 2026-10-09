import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { ExportButton } from '../components/export-button';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { PersonAvatar } from '../components/person-avatar';
import { api } from '../lib/api';
import { NO_VALUE, relativeTime, SEPARATOR } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { type AuditRecord, describe, summarise } from './audit-format';

/**
 * Sent explicitly rather than taking the server's default.
 *
 * The API defaults to 50, which is a reasonable API default and a long first
 * screen. It also has to stay explicit for the paging test to mean anything:
 * with no limit, any log short of 50 entries fits on one page and the cursor
 * is never exercised.
 */
const PAGE_SIZE = 25;

/**
 * Your activity (ADR-063): the audit log held to what you did, for anyone.
 * The server sets you as the person; this page only asks.
 */
export function YourActivityPage() {
  return <AuditPage mine />;
}

export function AuditPage({ mine = false }: { mine?: boolean }) {
  const intl = useIntl();
  const can = useCan();

  /**
   * Filters live in the URL rather than in state, so a filtered view is
   * shareable and the History links on detail pages are just links —
   * `/audit?resourceId=…` needs no second mechanism to be read.
   */
  const [params, setParams] = useSearchParams();

  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const resourceId = params.get('resourceId') ?? '';
  // One person's work, from their page (ADR-063). Your own needs no filter.
  const actorId = mine ? '' : (params.get('actorId') ?? '');
  const base = mine ? '/account/activity' : '/audit';

  const [actions, setActions] = useState<string[]>([]);

  const canView = mine || can('audit.view');

  /** The filters as the API wants them. */
  function queryFor(): string {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });

    if (action) query.set('action', action);
    if (resourceId) query.set('resourceId', resourceId);
    if (actorId) query.set('actorId', actorId);
    // The date input gives YYYY-MM-DD; the API takes ISO timestamps.
    if (from) query.set('from', new Date(from).toISOString());
    if (to) query.set('to', new Date(to).toISOString());

    return query.toString();
  }

  const { entries, error, loading, hasMore, loadingMore, loadMore } =
    useKeysetList<AuditRecord>(canView ? `${base}?${queryFor()}` : null);
  const showSkeleton = useDelayedFlag(loading);

  /**
   * A new filter is a new list, so the previous one's rows and cursor go
   * with it (see useKeysetList).
   *
   * replace, so changing a filter four times leaves one entry in the back
   * stack rather than four.
   */
  function changeFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);

    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }

    setParams(next, { replace: true });
  }

  /**
   * The action vocabulary, from the log rather than a constant: the client
   * cannot import the server's AUDIT_ACTIONS, and a duplicated list drifts.
   * It also offers only what has happened, so the filter never contains an
   * option that returns nothing.
   */
  useEffect(() => {
    // Your own page offers no action filter: the vocabulary is the log's.
    if (!canView || mine) return;

    let ignore = false;

    void api<string[]>('/audit/actions')
      .then((rows) => {
        if (!ignore) setActions(rows);
      })
      // A failed vocabulary costs the filter, not the log. The banner below is
      // reserved for the entries themselves.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [canView, mine]);

  if (!canView) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          {intl.formatMessage({
            id: 'layout.menu.auditLog',
            defaultMessage: 'Audit log',
          })}
        </Typography>
        <Alert severity="info">
          {intl.formatMessage({
            id: 'audit.noAccess',
            defaultMessage:
              'Your role does not include access to the audit log.',
          })}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={
          mine
            ? intl.formatMessage({
                id: 'audit.yours.title',
                defaultMessage: 'Your activity',
              })
            : intl.formatMessage({
                id: 'layout.menu.auditLog',
                defaultMessage: 'Audit log',
              })
        }
        subtitle={
          mine
            ? intl.formatMessage({
                id: 'audit.yours.intro',
                defaultMessage:
                  'Everything you did in this organization, newest first. Your sign-ins and password changes are on Your devices.',
              })
            : intl.formatMessage({
                id: 'audit.intro',
                defaultMessage:
                  'Every change made in this organization, newest first. Entries are kept for two years and cannot be edited or removed. Where a value is shown, it is what the field was set to — not what it was before.',
              })
        }
        actions={
          canView && (
            // With the page's own filters; the export is itself an entry.
            <ExportButton
              path={`${base}/export?${queryFor().replace(/(^|&)limit=\d+&?/, '$1')}`}
            />
          )
        }
      />

      {/* Their own row rather than beside the title: three controls crowd a
          heading, and an actor filter is the obvious next one. */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        {!mine && (
          <TextField
            id="audit-action"
            label={intl.formatMessage({
              id: 'audit.action',
              defaultMessage: 'Action',
            })}
            select
            size="small"
            value={action}
            onChange={(event) => changeFilter({ action: event.target.value })}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">
              {intl.formatMessage({
                id: 'audit.allActions',
                defaultMessage: 'All actions',
              })}
            </MenuItem>
            {actions.map((key) => (
              <MenuItem key={key} value={key}>
                {describe(key)}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          id="audit-from"
          label={intl.formatMessage({
            id: 'audit.from',
            defaultMessage: 'From',
          })}
          type="date"
          size="small"
          value={from}
          onChange={(event) => changeFilter({ from: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          id="audit-to"
          label={intl.formatMessage({
            id: 'audit.to',
            defaultMessage: 'To',
          })}
          type="date"
          size="small"
          value={to}
          onChange={(event) => changeFilter({ to: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      {/* As below, for one person's work, opened from their page. */}
      {actorId && (
        <Alert
          severity="info"
          action={
            <Button size="small" onClick={() => changeFilter({ actorId: '' })}>
              {intl.formatMessage({
                id: 'audit.showAll',
                defaultMessage: 'Show all',
              })}
            </Button>
          }
        >
          {intl.formatMessage({
            id: 'audit.onePerson',
            defaultMessage: "Showing one person's activity only.",
          })}
        </Alert>
      )}

      {/* A UUID in the query string is invisible, and a log filtered to one
          record looks broken rather than filtered. */}
      {resourceId && (
        <Alert
          severity="info"
          action={
            <Button
              size="small"
              onClick={() => changeFilter({ resourceId: '' })}
            >
              {intl.formatMessage({
                id: 'audit.showAll',
                defaultMessage: 'Show all',
              })}
            </Button>
          }
        >
          {intl.formatMessage({
            id: 'audit.oneRecord',
            defaultMessage: 'Showing one record only.',
          })}
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {loading && showSkeleton && <Skeleton height={200} />}

      {entries?.length === 0 && (
        <Alert severity="info">
          {action || from || to || resourceId || actorId
            ? intl.formatMessage({
                id: 'audit.noMatch',
                defaultMessage: 'Nothing matches these filters.',
              })
            : intl.formatMessage({
                id: 'account.activity.empty',
                defaultMessage: 'Nothing recorded yet.',
              })}
        </Alert>
      )}

      {!!entries?.length && (
        <>
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'audit.action',
                        defaultMessage: 'Action',
                      })}
                    </TableCell>
                    {/* Your activity is all yours: no column to say so. */}
                    {!mine && (
                      <TableCell>
                        {intl.formatMessage({
                          id: 'inventory.movements.by',
                          defaultMessage: 'By',
                        })}
                      </TableCell>
                    )}
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.movements.when',
                        defaultMessage: 'When',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'audit.from',
                        defaultMessage: 'From',
                      })}
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {describe(entry.action)}
                        {/* Which one. Without it the organization-wide log
                          reads as a column of "Product updated" (ADR-038). */}
                        {entry.resourceLabel && (
                          <Typography
                            component="span"
                            variant="inherit"
                            sx={{ fontWeight: 600 }}
                          >
                            {SEPARATOR}
                            {entry.resourceLabel}
                          </Typography>
                        )}
                        {/* component="div": the default <p> inside a cell
                          alongside text is invalid markup. */}
                        {summarise(entry.payload) && (
                          <Typography
                            variant="caption"
                            component="div"
                            color="text.secondary"
                          >
                            {summarise(entry.payload)}
                          </Typography>
                        )}
                      </TableCell>

                      {!mine && (
                        <TableCell>
                          {/* A tombstoned actor keeps its id and loses its
                            email (ADR-012). The row stays, which is the point.
                            The name leads; the email tells two Meis apart. */}
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center' }}
                          >
                            <PersonAvatar
                              userId={entry.actorId}
                              name={entry.actorName ?? null}
                              email={entry.actorEmail}
                              photoFileId={entry.actorPhotoFileId}
                              size={28}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" noWrap>
                                {entry.actorName ||
                                  entry.actorEmail ||
                                  intl.formatMessage({
                                    id: 'audit.removedAccount',
                                    defaultMessage: 'A removed account',
                                  })}
                              </Typography>
                              {entry.actorName && entry.actorEmail && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  title={entry.actorEmail}
                                  sx={{ display: 'block' }}
                                >
                                  {entry.actorEmail}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </TableCell>
                      )}

                      <TableCell>{relativeTime(entry.createdAt)}</TableCell>
                      <TableCell>{entry.ip ?? NO_VALUE}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <LoadMoreButton
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </>
      )}
    </Stack>
  );
}
