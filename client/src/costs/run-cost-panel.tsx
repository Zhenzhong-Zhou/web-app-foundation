import {
  Alert,
  Chip,
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
import { useIntl } from 'react-intl';

import { LabelledValue } from '../components/labelled-value';
import {
  formatMoney,
  formatQuantity,
  formatUnitCost,
  NO_VALUE,
} from '../lib/format';
import type { RunCost } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

/**
 * What one batch cost to make (ADR-048): what its run consumed, at the value
 * each component carried, and what that comes to per unit.
 *
 * Material cost only, and the panel says so — what we supplied. A
 * manufacturer's own components and charge are not in the figure. Shown only
 * for a closed run, since consumption is written at close (ADR-032).
 *
 * Fetches on its own rather than widening the run's response: the run page
 * is for anyone who can see production, and cost is behind costs.view.
 */
export function RunCostPanel({ runId }: { runId: string }) {
  const intl = useIntl();
  const { data, error, loading } = useResource<{ runCost: RunCost }>(
    `/costs/runs/${runId}`,
  );
  const cost = data?.runCost ?? null;

  const showSkeleton = useDelayedFlag(loading);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!cost) return showSkeleton ? <Skeleton height={160} /> : null;

  const currency = cost.currency;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2">
          {intl.formatMessage({ id: 'costs.cost', defaultMessage: 'Cost' })}
        </Typography>
        {cost.provisional && (
          <Chip
            size="small"
            label={intl.formatMessage({
              id: 'costs.provisional',
              defaultMessage: 'Provisional',
            })}
            color="warning"
          />
        )}
      </Stack>

      {cost.provisional && (
        <Alert severity="warning">
          {intl.formatMessage({
            id: 'costs.run.provisional',
            defaultMessage:
              'Something this run used was still waiting for a cost when it was consumed, so these figures are low. Setting that cost now records the difference, but does not change this batch.',
          })}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={4}>
          <LabelledValue
            label={intl.formatMessage({
              id: 'costs.run.material',
              defaultMessage: 'Material cost',
            })}
            value={formatMoney(cost.materialCost, currency)}
          />
          <LabelledValue
            label={intl.formatMessage({
              id: 'costs.run.perUnit',
              defaultMessage: 'Per unit',
            })}
            value={
              cost.unitCost === null
                ? intl.formatMessage({
                    id: 'costs.run.nothingMade',
                    defaultMessage: 'Nothing was made',
                  })
                : formatUnitCost(cost.unitCost, currency)
            }
          />
          <LabelledValue
            label={intl.formatMessage({
              id: 'costs.entry.made',
              defaultMessage: 'Made',
            })}
            value={formatQuantity(cost.quantityProduced)}
          />
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 1 }}
        >
          {intl.formatMessage({
            id: 'costs.run.whatWeSupplied',
            defaultMessage:
              'What we supplied. Components the manufacturer provided, and any charge for making it, are not included.',
          })}
        </Typography>
      </Paper>

      {cost.consumed.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table
              size="small"
              aria-label={intl.formatMessage({
                id: 'costs.run.used',
                defaultMessage: 'What it used',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'production.used',
                      defaultMessage: 'Used',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.lot',
                      defaultMessage: 'Lot',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'inventory.quantity',
                      defaultMessage: 'Quantity',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'costs.value',
                      defaultMessage: 'Value',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cost.consumed.map((row) => (
                  <TableRow key={`${row.sku}:${row.lotCode ?? ''}`}>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>{row.lotCode ?? NO_VALUE}</TableCell>
                    <TableCell align="right">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell align="right">
                      {formatMoney(row.value, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {cost.outputs.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table
              size="small"
              aria-label={intl.formatMessage({
                id: 'costs.run.made',
                defaultMessage: 'What it made',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'costs.batch',
                      defaultMessage: 'Batch',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'costs.entry.made',
                      defaultMessage: 'Made',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {intl.formatMessage({
                      id: 'costs.cost',
                      defaultMessage: 'Cost',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cost.outputs.map((row) => (
                  <TableRow key={row.lotCode ?? 'untracked'}>
                    <TableCell>{row.lotCode ?? NO_VALUE}</TableCell>
                    <TableCell align="right">
                      {formatQuantity(row.quantity)}
                    </TableCell>
                    <TableCell align="right">
                      {formatMoney(row.value, currency)}
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
