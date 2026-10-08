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
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { type DayRange, withDays } from '../lib/date-range';
import { formatDay, formatMoney, NO_VALUE } from '../lib/format';
import type { InvoiceStatus, InvoiceSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { useListSort, withSort } from '../lib/use-list-sort';
import { STATUS_TONES } from '../theme/status';
import { CreditNotesLink } from './credit-notes-page';
import { invoiceStatus } from './invoice-status';

type Filter = InvoiceStatus | 'all';

const LABELS = defineMessages({
  all: { id: 'invoices.filter.all', defaultMessage: 'All' },
  draft: { id: 'invoices.filter.drafts', defaultMessage: 'Drafts' },
  issued: { id: 'invoices.status.issued', defaultMessage: 'Issued' },
  voided: { id: 'orders.shipments.voided', defaultMessage: 'Voided' },
});

const FILTERS: { value: Filter; label: MessageDescriptor }[] = [
  { value: 'all', label: LABELS.all },
  { value: 'draft', label: LABELS.draft },
  { value: 'issued', label: LABELS.issued },
  { value: 'voided', label: LABELS.voided },
];

function query(filter: Filter): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  const text = params.toString();
  return text ? `/invoices?${text}` : '/invoices';
}

/**
 * Every invoice, newest first (ADR-046).
 *
 * All statuses by default, unlike orders: a voided invoice is still a
 * document someone asks about, and an issued one stays current until
 * payments exist to settle it. Keyset paging, as orders page.
 *
 * Invoices are created from a shipment on its order, not here — an invoice
 * bills exactly what one shipment carried.
 */
export function InvoicesPage() {
  const intl = useIntl();
  const [filter, setFilter] = useState<Filter>('all');
  const { text, setText, search } = useListSearch();
  // By invoice date, sortable by date and total (ADR-057); the export
  // takes the same query.
  const [range, setRange] = useState<DayRange>({});
  const { sort, toggle } = useListSort<'invoiceDate' | 'total'>();
  const path = withSort(
    withDays(withSearch(query(filter), search), range),
    sort,
  );
  const invoiceDate = intl.formatMessage({
    id: 'invoices.date',
    defaultMessage: 'Date',
  });
  const total = intl.formatMessage({
    id: 'orders.lines.total',
    defaultMessage: 'Total',
  });
  const {
    entries: rows,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<InvoiceSummary>(path);
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.invoices',
          defaultMessage: 'Invoices',
        })}
        subtitle={intl.formatMessage({
          id: 'invoices.intro',
          defaultMessage:
            'An invoice bills one shipment, and is created from it on the order. Once issued it never changes — a mistake is voided with a credit note and invoiced again.',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            <ExportButton
              path={path.replace('/invoices', '/invoices/export')}
            />
            <CreditNotesLink />
          </Stack>
        }
      />

      {/* The one filter row (ADR-055): which invoices, as buttons. Tabs
          were for sections of one thing, not for narrowing a list. */}
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
          label={invoiceDate}
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
              : filter === 'all'
                ? intl.formatMessage({
                    id: 'invoices.empty',
                    defaultMessage:
                      'No invoices yet. Open an order and create one from a shipment.',
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
                  <SortHeader
                    label={invoiceDate}
                    active={sort?.key === 'invoiceDate'}
                    order={sort?.order ?? 'asc'}
                    onSort={() => toggle('invoiceDate')}
                  />
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.due',
                      defaultMessage: 'Due',
                    })}
                  </TableCell>
                  <SortHeader
                    align="right"
                    label={total}
                    active={sort?.key === 'total'}
                    order={sort?.order ?? 'asc'}
                    onSort={() => toggle('total')}
                  />
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
                      <Link component={RouterLink} to={`/invoices/${row.id}`}>
                        {row.number ??
                          intl.formatMessage({
                            id: 'orders.status.draft',
                            defaultMessage: 'Draft',
                          })}
                      </Link>
                    </TableCell>
                    <TableCell>{row.partnerName}</TableCell>
                    <TableCell>
                      {row.invoiceDate ? formatDay(row.invoiceDate) : NO_VALUE}
                    </TableCell>
                    <TableCell>
                      {row.dueDate ? formatDay(row.dueDate) : NO_VALUE}
                    </TableCell>
                    <TableCell align="right">
                      {/* Stored at issue; a draft's total is on its page. */}
                      {formatMoney(row.total, row.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        tone={STATUS_TONES.invoice[row.status]}
                        label={invoiceStatus(row.status).label}
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
