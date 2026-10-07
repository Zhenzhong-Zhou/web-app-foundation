import { Box, Divider, Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { StatusChip } from '../components/status-chip';
import { formatMoney, NO_VALUE } from '../lib/format';
import type { OrderDetail } from '../lib/types';

/** A label and its figure on one line, the figure right-aligned. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: 'space-between',
        gap: 2,
        py: 0.75,
        borderBottom: 1,
        borderColor: 'surface.line',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: 'right' }}>
        {children}
      </Typography>
    </Stack>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      component="h3"
      sx={{ fontWeight: 700, color: 'text.secondary', mt: 1.5, mb: 0.25 }}
    >
      {children}
    </Typography>
  );
}

/**
 * The order's summary beside its tabs (ADR-055): what can be done to it,
 * then how far it has got, then, on a sale, its money, every figure saying
 * whether tax is in it. An accountant asked which figure "Total" was; each
 * one here says.
 *
 * Progress is counted in items, not summed in quantities: an order's lines
 * can be in different units, and 600 bottles plus 15 kg is not a number.
 * The quantities themselves are in the Items tab.
 *
 * Every amount comes from the server (step 4): nothing is added up here.
 */
export function OrderSummary({
  order,
  actions,
  onShowReturns,
}: {
  order: OrderDetail;
  /** The order's own actions: edit, duplicate, confirm, close, history. */
  actions: ReactNode;
  /** Opens the Returns tab, where an unsettled return is linked to an RMA. */
  onShowReturns: () => void;
}) {
  const intl = useIntl();

  const done = order.lines.filter((line) => line.isComplete).length;
  const money = order.money;
  const total = order.totals[0];

  return (
    <Stack>
      <Stack spacing={1} sx={{ mb: 1 }}>
        {actions}
      </Stack>

      <Divider />

      <Heading>
        {intl.formatMessage({ id: 'orders.items', defaultMessage: 'Items' })}
      </Heading>
      <Fact
        label={intl.formatMessage({
          id: 'orders.summary.complete',
          defaultMessage: 'Complete',
        })}
      >
        {intl.formatMessage(
          {
            id: 'orders.summary.completeOf',
            defaultMessage: '{done} of {total}',
          },
          { done, total: order.lines.length },
        )}
      </Fact>

      {order.unsettledReturns > 0 && (
        <Box sx={{ mt: 1 }}>
          <Link component="button" type="button" onClick={onShowReturns}>
            <StatusChip
              tone="warning"
              label={intl.formatMessage(
                {
                  id: 'orders.summary.unsettled',
                  defaultMessage:
                    '{count, plural, one {# return not yet settled} other {# returns not yet settled}}',
                },
                { count: order.unsettledReturns },
              )}
            />
          </Link>
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: 0.5 }}
          >
            {intl.formatMessage({
              id: 'orders.summary.unsettled.help',
              defaultMessage:
                'No RMA yet: decide on a credit, a replacement or no action.',
            })}
          </Typography>
        </Box>
      )}

      {money && (
        <>
          <Heading>
            {intl.formatMessage(
              {
                id: 'orders.summary.money',
                defaultMessage: 'Money ({currency})',
              },
              { currency: money.currency ?? '' },
            )}
          </Heading>
          <Fact
            label={intl.formatMessage({
              id: 'orders.summary.orderValue',
              defaultMessage: 'Order value, before tax',
            })}
          >
            {total ? formatMoney(total.amount, total.currency) : NO_VALUE}
          </Fact>
          <Fact
            label={intl.formatMessage({
              id: 'orders.summary.invoiced',
              defaultMessage: 'Invoiced, incl. tax',
            })}
          >
            {formatMoney(money.invoiced, money.currency)}
          </Fact>
          <Fact
            label={intl.formatMessage({
              id: 'orders.summary.credited',
              defaultMessage: 'Credited, incl. tax',
            })}
          >
            {formatMoney(money.credited, money.currency)}
          </Fact>
          <Fact
            label={intl.formatMessage({
              id: 'orders.summary.net',
              defaultMessage: 'Net invoiced, incl. tax',
            })}
          >
            <strong>{formatMoney(money.netInvoiced, money.currency)}</strong>
          </Fact>
          <Fact
            label={intl.formatMessage({
              id: 'orders.summary.notInvoiced',
              defaultMessage: 'Not yet invoiced, before tax',
            })}
          >
            {formatMoney(money.notInvoiced, money.currency)}
          </Fact>
          {!order.totalsComplete && (
            <Typography variant="caption" color="text.secondary" component="p">
              {intl.formatMessage({
                id: 'orders.summary.unpriced',
                defaultMessage: 'Not every item is priced yet.',
              })}
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
}
