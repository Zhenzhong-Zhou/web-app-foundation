import {
  Alert,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useState } from 'react';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { type DayRange, withInstants } from '../lib/date-range';
import { formatDate } from '../lib/format';
import type {
  ReturnAuthorizationStatus,
  ReturnAuthorizationSummary,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { STATUS_TONES } from '../theme/status';
import { rmaStatus } from './rma-labels';

type Filter = ReturnAuthorizationStatus | 'all';

const LABELS = defineMessages({
  open: { id: 'orders.filter.open', defaultMessage: 'Open' },
  closed: { id: 'rmas.status.closed', defaultMessage: 'Closed' },
  cancelled: { id: 'orders.status.cancelled', defaultMessage: 'Cancelled' },
  all: { id: 'invoices.filter.all', defaultMessage: 'All' },
});

const FILTERS: { value: Filter; label: MessageDescriptor }[] = [
  { value: 'open', label: LABELS.open },
  { value: 'closed', label: LABELS.closed },
  { value: 'cancelled', label: LABELS.cancelled },
  { value: 'all', label: LABELS.all },
];

function query(filter: Filter): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  const text = params.toString();
  return text ? `/return-authorizations?${text}` : '/return-authorizations';
}

/**
 * Return authorizations (ADR-047), open first: the ones still waiting on
 * goods, a credit or a replacement are customer service's worklist.
 *
 * An RMA is raised from the sale it concerns, not here — it needs that
 * order's lines.
 */
export function RmasPage() {
  const intl = useIntl();
  const [filter, setFilter] = useState<Filter>('open');
  const { text, setText, search } = useListSearch();
  // When raised, the reader's days as instants (ADR-057).
  const [range, setRange] = useState<DayRange>({});
  const {
    entries: rows,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<ReturnAuthorizationSummary>(
    withInstants(withSearch(query(filter), search), range),
  );
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.returns',
          defaultMessage: 'Returns',
        })}
        subtitle={intl.formatMessage({
          id: 'rmas.intro',
          defaultMessage:
            'Return authorizations: what a customer may send back, and whether it is credited, replaced or neither. Raise one from the sale it concerns.',
        })}
      />

      {/* The one filter row (ADR-055), as on Orders and Invoices. */}
      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: text,
          onChange: setText,
        }}
        quick={FILTERS.map((option) => ({
          id: option.value,
          label: intl.formatMessage(option.label),
          pressed: filter === option.value,
          onToggle: () => setFilter(option.value),
        }))}
      >
        <DateRangeFilter
          label={intl.formatMessage({
            id: 'rmas.raised',
            defaultMessage: 'Raised',
          })}
          value={range}
          onChange={setRange}
        />
      </FilterRow>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : rows?.length === 0 ? (
          <EmptyState>
            {search || range.from || range.to
              ? intl.formatMessage({
                  id: 'inventory.noMatch',
                  defaultMessage: 'Nothing matches that search.',
                })
              : filter === 'open'
                ? intl.formatMessage({
                    id: 'rmas.empty',
                    defaultMessage: 'No open returns.',
                  })
                : intl.formatMessage({
                    id: 'invoices.emptyFiltered',
                    defaultMessage: 'Nothing here.',
                  })}
          </EmptyState>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.number',
                      defaultMessage: 'Number',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.customer',
                      defaultMessage: 'Customer',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.trace.order',
                      defaultMessage: 'Order',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.void.reason',
                      defaultMessage: 'Reason',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'rmas.raised',
                      defaultMessage: 'Raised',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows?.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/return-authorizations/${row.id}`}
                      >
                        {row.number}
                      </Link>
                    </TableCell>
                    <TableCell>{row.partnerName}</TableCell>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/orders/${row.orderId}`}
                      >
                        {row.orderReference ??
                          intl.formatMessage({
                            id: 'inventory.trace.order',
                            defaultMessage: 'Order',
                          })}
                      </Link>
                    </TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell>
                      <StatusChip
                        tone={STATUS_TONES.returnAuthorization[row.status]}
                        label={rmaStatus(row.status).label}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </Stack>
  );
}
