import {
  Button,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { CreditNoteSummary } from '../api/types.gen';
import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { PlaceholderRows } from '../components/placeholder-rows';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { withDays } from '../lib/date-range';
import { formatCredit, formatDay, NO_VALUE } from '../lib/format';
import { useKeysetList } from '../lib/use-keyset-list';
import { day, useListFilters } from '../lib/use-list-filters';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { useListSort, withSort } from '../lib/use-list-sort';

/**
 * Every credit note, newest first (ADR-057). They had pages but no list,
 * so a quarter's credit notes could be neither shown nor exported; now
 * they sit beside Invoices, with the same search.
 */
/** The credit date's range, kept in the address as Invoices keeps it. */
const ADDRESS_FILTERS = { from: day, to: day };

export function CreditNotesPage() {
  const intl = useIntl();
  const { text, setText, search } = useListSearch();
  // By credit date, sortable by date and amount (ADR-057), the days in
  // the address with the sort, so Back keeps both (ADR-091's review).
  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const range = { from: filters.from, to: filters.to };
  const { sort, header } = useListSort(['creditDate', 'total']);
  const path = withSort(
    withDays(withSearch('/credit-notes', search), range),
    sort,
  );
  const creditDate = intl.formatMessage({
    id: 'invoices.date',
    defaultMessage: 'Date',
  });
  const amount = intl.formatMessage({
    id: 'invoices.amount',
    defaultMessage: 'Amount',
  });
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
  } = useKeysetList<CreditNoteSummary>(path);

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.invoices',
              defaultMessage: 'Invoices',
            }),
            to: '/invoices',
          },
        ]}
        title={intl.formatMessage({
          id: 'invoices.creditNotes',
          defaultMessage: 'Credit notes',
        })}
        subtitle={intl.formatMessage({
          id: 'creditNotes.intro',
          defaultMessage:
            'A credit note gives back part or all of an invoice. It is issued from the invoice, and never changes.',
        })}
        actions={
          <ExportButton
            path={path.replace('/credit-notes', '/credit-notes/export')}
          />
        }
      />

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: text,
          onChange: setText,
        }}
      >
        <DateRangeFilter
          label={creditDate}
          value={range}
          onChange={(next) => setFilters({ from: next.from, to: next.to })}
        />
      </FilterRow>

      <ListError error={error} onRetry={failed ? reload : undefined} />

      {!failed && (
        <Paper variant="outlined">
          {/* The table's head stays while the rows are read, a sort's
              included, so the header pressed keeps its focus (#505's 54). */}
          {!loading && rows?.length === 0 ? (
            <EmptyState learnMore={{ guide: 'invoices', section: 'credit' }}>
              {search || range.from || range.to
                ? intl.formatMessage({
                    id: 'inventory.noMatch',
                    defaultMessage: 'Nothing matches that search.',
                  })
                : intl.formatMessage({
                    id: 'creditNotes.empty',
                    defaultMessage:
                      'No credit notes yet. Open an issued invoice to credit part of it.',
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
                        id: 'invoices.invoice',
                        defaultMessage: 'Invoice',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'invoices.customer',
                        defaultMessage: 'Customer',
                      })}
                    </TableCell>
                    <SortHeader label={creditDate} {...header('creditDate')} />
                    <SortHeader
                      align="right"
                      label={amount}
                      {...header('total')}
                    />
                    <TableCell />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {loading && <PlaceholderRows columns={6} />}
                  {rows?.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Link
                          component={RouterLink}
                          to={`/credit-notes/${row.id}`}
                        >
                          {row.number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          component={RouterLink}
                          to={`/invoices/${row.invoiceId}`}
                        >
                          {row.invoiceNumber ?? NO_VALUE}
                        </Link>
                      </TableCell>
                      <TableCell>{row.partnerName}</TableCell>
                      <TableCell>{formatDay(row.creditDate)}</TableCell>
                      <TableCell align="right">
                        {formatCredit(row.total, row.currency)}
                      </TableCell>
                      <TableCell>
                        {row.isVoid && (
                          <StatusChip
                            tone="critical"
                            label={intl.formatMessage({
                              id: 'invoices.creditNote.voids',
                              defaultMessage: 'Voids invoice',
                            })}
                          />
                        )}
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

/** The invoices page's way to its credit notes. */
export function CreditNotesLink() {
  const intl = useIntl();
  return (
    <Button component={RouterLink} to="/credit-notes" variant="outlined">
      {intl.formatMessage({
        id: 'invoices.creditNotes',
        defaultMessage: 'Credit notes',
      })}
    </Button>
  );
}
