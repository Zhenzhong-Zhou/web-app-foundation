import {
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
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { ReturnAuthorizationSummary } from '../api/types.gen';
import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import type { ReturnAuthorizationStatus } from '../lib/api-names';
import { withInstants } from '../lib/date-range';
import { formatDay } from '../lib/format';
import { organizationDayOf } from '../lib/time-zone';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { day, oneOf, useListFilters } from '../lib/use-list-filters';
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

const FILTER_VALUES: readonly Filter[] = ['all', 'open', 'closed', 'cancelled'];

/**
 * The list's filters, in the address (ADR-091): Home's tile opens the open
 * ones, the default, and what is pressed here is kept there, with the days
 * raised, `from` and `to`.
 */
const ADDRESS_FILTERS = {
  status: oneOf(FILTER_VALUES, 'open'),
  from: day,
  to: day,
};

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
  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const filter = filters.status;
  const { text, setText, search } = useListSearch();
  // When raised, the reader's days as instants (ADR-057).
  const range = { from: filters.from, to: filters.to };
  const {
    entries: rows,
    error,
    refused,
    failed,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<ReturnAuthorizationSummary>(
    withInstants(withSearch(query(filter), search), range),
  );
  const showSkeleton = useDelayedFlag(loading);

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

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
          onToggle: () => setFilters({ status: option.value }),
        }))}
      >
        <DateRangeFilter
          label={intl.formatMessage({
            id: 'rmas.raised',
            defaultMessage: 'Raised',
          })}
          value={range}
          onChange={(next) => setFilters({ from: next.from, to: next.to })}
        />
      </FilterRow>

      <ListError error={error} onRetry={failed ? reload : undefined} />

      {!failed && (
        <Paper variant="outlined">
          {loading ? (
            <Stack sx={{ p: 2 }} spacing={1}>
              {showSkeleton ? <Skeleton height={48} /> : null}
            </Stack>
          ) : rows?.length === 0 ? (
            <EmptyState learnMore={{ guide: 'returns', section: 'authorize' }}>
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
                          {row.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{row.reason}</TableCell>
                      <TableCell>
                        {formatDay(organizationDayOf(row.createdAt))}
                      </TableCell>
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
      )}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </Stack>
  );
}
