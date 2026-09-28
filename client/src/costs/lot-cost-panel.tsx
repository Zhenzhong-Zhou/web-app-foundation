import {
  Alert,
  Chip,
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
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDate, formatMoney, formatUnitCost } from '../lib/format';
import type { LotCost, LotCostEntry } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * What a valuation row was, in words. A sign test on the string, not
 * arithmetic (ADR-025): an inbound adjustment is positive, an outbound one
 * negative.
 */
function describe(entry: LotCostEntry): string {
  switch (entry.kind) {
    case 'opening':
      return 'Opening balance';
    case 'run_close':
      return 'Batch cost at close';
    case 'correction':
      return 'Cost set or corrected';
    case 'issued':
      return 'Cost of stock already gone';
    default:
      break;
  }

  switch (entry.reason) {
    case 'receipt':
      return 'Received';
    case 'production':
      return 'Made';
    case 'consumption':
      return 'Used in a run';
    case 'shipment':
      return 'Shipped';
    case 'sample':
      return 'Sampled';
    case 'return':
      return 'Returned';
    case 'adjustment':
      return entry.quantity.startsWith('-') ? 'Counted out' : 'Counted in';
    default:
      return entry.reason ?? entry.kind;
  }
}

/**
 * What one lot is worth and how it got there (ADR-048): its pool, and the
 * valuation rows that made it, newest first.
 *
 * Read-only. Setting a missing cost happens on the Stock value page, which
 * is where the to-do list lives; this links there when the lot is waiting.
 */
export function LotCostPanel({ lotId }: { lotId: string }) {
  const [cost, setCost] = useState<LotCost | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showSkeleton = useDelayedFlag(cost === null && error === null);

  useEffect(() => {
    let ignore = false;

    void api<{ lotCost: LotCost }>(`/costs/lots/${lotId}`)
      .then((response) => {
        if (!ignore) setCost(response.lotCost);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [lotId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!cost) return showSkeleton ? <Skeleton height={160} /> : null;

  const currency = cost.currency;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2">
          Cost
        </Typography>
        {cost.provisional && (
          <Chip size="small" label="Provisional" color="warning" />
        )}
      </Stack>

      {cost.provisional && (
        <Alert severity="warning">
          Part of this lot is still waiting for a cost. Set it on the{' '}
          <Link component={RouterLink} to="/costs">
            Stock value
          </Link>{' '}
          page.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={4}>
          <Figure
            label="Unit cost"
            value={
              cost.unitCost === null
                ? 'None on hand'
                : formatUnitCost(cost.unitCost, currency)
            }
          />
          <Figure label="On hand" value={cost.quantity} />
          <Figure label="Value" value={formatMoney(cost.value, currency)} />
        </Stack>
      </Paper>

      {cost.entries.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small" aria-label="How its value changed">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>What</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell>Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cost.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    <TableCell>
                      {describe(entry)}
                      {entry.needsCost && (
                        <Chip
                          size="small"
                          label="Needs a cost"
                          color="warning"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {entry.kind === 'movement' || entry.kind === 'opening'
                        ? entry.quantity
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {formatMoney(entry.value, currency)}
                    </TableCell>
                    <TableCell>
                      {entry.unitPrice
                        ? `${formatUnitCost(entry.unitPrice, entry.currency)}${
                            entry.exchangeRate
                              ? ` at ${entry.exchangeRate.replace(/\.?0+$/, '')}`
                              : ''
                          }`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Stack>
  );
}
