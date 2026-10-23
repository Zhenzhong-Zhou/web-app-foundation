import {
  Alert,
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

import type { AuditActionName } from '../api/types.gen';
import type { AuditRecord } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { ReferencesWhole } from '../components/reference';
import { When, Who } from '../components/who-and-when';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { api, withQuery } from '../lib/api';
import { withInstants } from '../lib/date-range';
import { NO_VALUE, SEPARATOR } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { rem } from '../theme/rem';
import { AuditDetails } from './audit-details';

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

  const [actions, setActions] = useState<AuditActionName[]>([]);

  const canView = mine || can('audit.view');

  /**
   * The filters as the API wants them. The date inputs give days; the log
   * holds moments, so they go as the moments those days begin and end at
   * the organization's midnight, the last day whole, as every list of
   * moments asks (ADR-057, ADR-072).
   */
  function pathFor(path: string): string {
    return withInstants(withQuery(path, { action, resourceId, actorId }), {
      from,
      to,
    });
  }

  const {
    entries,
    error,
    refused,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<AuditRecord>(
    canView ? pathFor(`${base}?limit=${PAGE_SIZE}`) : null,
  );
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
   * The action vocabulary, from the log rather than the generated list
   * (ADR-068): it offers only what has happened, so the filter never
   * contains an option that returns nothing.
   */
  useEffect(() => {
    // Your own page offers no action filter: the vocabulary is the log's.
    if (!canView || mine) return;

    let ignore = false;

    void api<AuditActionName[]>('/audit/actions')
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
            defaultMessage: 'Your roles don’t include the audit log.',
          })}
        </Alert>
      </Stack>
    );
  }

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
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
                  'Every change made in this organization, newest first. Entries are kept for two years and cannot be edited or removed. A field with an arrow changed from the first value to the second; a value on its own is what the field was set to.',
              })
        }
        actions={
          canView && (
            // With the page's own filters; the export is itself an entry.
            <ExportButton path={pathFor(`${base}/export`)} />
          )
        }
      />

      {/* Their own row rather than beside the title: three controls crowd a
          heading, and an actor filter is the obvious next one. */}
      <FilterRow>
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
            sx={{ minWidth: rem(220) }}
          >
            <MenuItem value="">
              {intl.formatMessage({
                id: 'audit.allActions',
                defaultMessage: 'All actions',
              })}
            </MenuItem>
            {actions.map(({ action: key, name }) => (
              <MenuItem key={key} value={key}>
                {name}
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
      </FilterRow>

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
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.movements.by',
                        defaultMessage: 'By',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.movements.when',
                        defaultMessage: 'When',
                      })}
                    </TableCell>
                    {/* Where the change came from, its address: a word of
                        its own, since the date filter's From is a day. */}
                    <TableCell>
                      {intl.formatMessage({
                        id: 'audit.fromWhere',
                        defaultMessage: 'From',
                      })}
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      {/* A floor, so on a phone the table scrolls inside its
                          box rather than squeezing what happened into a
                          column of single words. Codes in it stay whole,
                          as everywhere (ADR-055). */}
                      <TableCell sx={{ minWidth: rem(260) }}>
                        {entry.actionName}
                        {/* Which one. Without it the organization-wide log
                          reads as a column of "Product updated" (ADR-038). */}
                        {entry.resourceLabel && (
                          <Typography
                            component="span"
                            variant="inherit"
                            sx={{ fontWeight: 600 }}
                          >
                            {SEPARATOR}
                            <ReferencesWhole text={entry.resourceLabel} />
                          </Typography>
                        )}
                        {/* component="div": the default <p> inside a cell
                          alongside text is invalid markup. */}
                        {entry.details.length > 0 && (
                          <Typography
                            variant="caption"
                            component="div"
                            color="text.secondary"
                          >
                            <AuditDetails details={entry.details} />
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        {/* A tombstoned actor keeps its id and loses its
                          email (ADR-012); the row stays, which is the point. */}
                        <Who
                          userId={entry.actorId}
                          name={entry.actorName}
                          email={entry.actorEmail}
                          photoFileId={entry.actorPhotoFileId}
                        />
                      </TableCell>

                      <TableCell>
                        <When at={entry.createdAt} />
                      </TableCell>
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
