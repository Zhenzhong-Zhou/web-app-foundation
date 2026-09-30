import {
  Alert,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { LoadMoreButton } from '../components/load-more-button';
import { formatDay, formatMoney } from '../lib/format';
import type { InvoiceStatus, InvoiceSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { invoiceStatus } from './invoice-status';

type Filter = InvoiceStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'issued', label: 'Issued' },
  { value: 'voided', label: 'Voided' },
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
  const [filter, setFilter] = useState<Filter>('all');
  const {
    entries: rows,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<InvoiceSummary>(query(filter));
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Invoices
      </Typography>

      <Typography variant="body2" color="text.secondary">
        An invoice bills one shipment, and is created from it on the order. Once
        issued it never changes — a mistake is voided with a credit note and
        invoiced again.
      </Typography>

      <Tabs
        value={filter}
        onChange={(_event, value: Filter) => setFilter(value)}
        aria-label="Invoice status"
      >
        {FILTERS.map((option) => (
          <Tab key={option.value} value={option.value} label={option.label} />
        ))}
      </Tabs>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : rows?.length === 0 ? (
          <Alert severity="info">
            {filter === 'all'
              ? 'No invoices yet. Open an order and create one from a shipment.'
              : 'Nothing here.'}
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Number</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Due</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {rows?.map((row) => {
                  const status = invoiceStatus(row.status);
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Link component={RouterLink} to={`/invoices/${row.id}`}>
                          {row.number ?? 'Draft'}
                        </Link>
                      </TableCell>
                      <TableCell>{row.partnerName}</TableCell>
                      <TableCell>
                        {row.invoiceDate ? formatDay(row.invoiceDate) : '—'}
                      </TableCell>
                      <TableCell>
                        {row.dueDate ? formatDay(row.dueDate) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        {/* Stored at issue; a draft's total is on its page. */}
                        {formatMoney(row.total, row.currency)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={status.label}
                          color={status.color}
                          variant={
                            row.status === 'voided' ? 'outlined' : 'filled'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
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
