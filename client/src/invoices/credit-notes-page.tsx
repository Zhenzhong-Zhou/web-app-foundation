import {
  Alert,
  Button,
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
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { formatCredit, formatDay, NO_VALUE } from '../lib/format';
import type { CreditNoteSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch, withSearch } from '../lib/use-list-search';

/**
 * Every credit note, newest first (ADR-057). They had pages but no list,
 * so a quarter's credit notes could be neither shown nor exported; now
 * they sit beside Invoices, with the same search.
 */
export function CreditNotesPage() {
  const intl = useIntl();
  const { text, setText, search } = useListSearch();
  const {
    entries: rows,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<CreditNoteSummary>(withSearch('/credit-notes', search));
  const showSkeleton = useDelayedFlag(loading);

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
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : rows?.length === 0 ? (
          <EmptyState>
            {search
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
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.date',
                      defaultMessage: 'Date',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'invoices.amount',
                      defaultMessage: 'Amount',
                    })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>

              <TableBody>
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
