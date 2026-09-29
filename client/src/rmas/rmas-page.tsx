import {
  Alert,
  Button,
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

import { formatDate } from '../lib/format';
import type {
  ReturnAuthorizationStatus,
  ReturnAuthorizationSummary,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { rmaStatus } from './rma-labels';

type Filter = ReturnAuthorizationStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
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
  const [filter, setFilter] = useState<Filter>('open');
  const {
    entries: rows,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<ReturnAuthorizationSummary>(query(filter));
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Returns
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Return authorizations: what a customer may send back, and whether it is
        credited, replaced or neither. Raise one from the sale it concerns.
      </Typography>

      <Tabs
        value={filter}
        onChange={(_event, value: Filter) => setFilter(value)}
        aria-label="Return authorization status"
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
            {filter === 'open' ? 'No open returns.' : 'Nothing here.'}
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Number</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Order</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Raised</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows?.map((row) => {
                  const status = rmaStatus(row.status);
                  return (
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
                          {row.orderReference ?? 'Order'}
                        </Link>
                      </TableCell>
                      <TableCell>{row.reason}</TableCell>
                      <TableCell>{formatDate(row.createdAt)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={status.label}
                          color={status.color}
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

      {hasMore && (
        <Button
          variant="text"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          sx={{ alignSelf: 'center' }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Stack>
  );
}
