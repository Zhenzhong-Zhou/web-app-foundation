import { Box, Divider, Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { StatusChip } from '../components/status-chip';
import {
  displayQuantity,
  formatCredit,
  formatMoney,
  NO_VALUE,
} from '../lib/format';
import type { OrderDetail } from '../lib/types';
import { unitLabel } from '../products/units';
import { doneLabel } from './status';

/** A label and its figure on one line, the figure right-aligned. */
function Fact({
  label,
  note,
  children,
}: {
  label: string;
  /** A word on what the figure leaves out, under it. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        py: 0.75,
        borderBottom: 1,
        borderColor: 'surface.line',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ textAlign: 'right' }}>
          {children}
        </Typography>
      </Stack>
      {note && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ textAlign: 'right' }}
        >
          {note}
        </Typography>
      )}
    </Box>
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
 * The order's summary beside its tabs (ADR-055): the next act and the
 * order's own actions, then its quantities, then, on a sale, its money,
 * every figure saying whether tax is in it. An accountant asked which
 * figure "Total" was; each one here says.
 *
 * Quantities are summed by the server, and only when every item counts in
 * one unit: 600 bottles and 15 kg add up to nothing. A mixed order says how
 * many of its items are complete instead, and its quantities stay in the
 * Items tab.
 *
 * Every amount comes from the server (step 4): nothing is added up here.
 */
export function OrderSummary({
  order,
  primary,
  actions,
  onShowReturns,
  onShowDocuments,
}: {
  order: OrderDetail;
  /** The one thing to do next, full width at the top: Ship. */
  primary?: ReactNode;
  /** The order's own actions: confirm or close, edit, duplicate. */
  actions: ReactNode;
  /** Opens the Returns tab, where an unsettled return is linked to an RMA. */
  onShowReturns: () => void;
  /** Opens the Invoices and credits tab, or nothing without it. */
  onShowDocuments?: () => void;
}) {
  const intl = useIntl();

  const done = order.lines.filter((line) => line.isComplete).length;
  const money = order.money;
  const total = order.totals[0];

  const quantities = order.quantities;
  const sale = order.direction === 'sale';
  const inUnit = (quantity: string) =>
    quantities
      ? `${displayQuantity(quantity)} ${unitLabel(quantities.unit, intl)}`
      : displayQuantity(quantity);

  return (
    <Stack>
      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {primary}
        {actions}
      </Stack>

      <Divider />

      {quantities ? (
        <>
          <Heading>
            {intl.formatMessage({
              id: 'orders.summary.quantities',
              defaultMessage: 'Quantities',
            })}
          </Heading>
          <Fact
            label={intl.formatMessage({
              id: 'orders.lines.ordered',
              defaultMessage: 'Ordered',
            })}
          >
            {inUnit(quantities.ordered)}
          </Fact>
          <Fact
            label={doneLabel(order.direction)}
            note={
              order.counts.voidedShipments > 0
                ? intl.formatMessage(
                    {
                      id: 'orders.summary.voidedNote',
                      defaultMessage:
                        '{count, plural, one {not counting # voided shipment} other {not counting # voided shipments}}',
                    },
                    { count: order.counts.voidedShipments },
                  )
                : undefined
            }
          >
            {inUnit(quantities.fulfilled)}
          </Fact>
          <Fact
            label={
              sale
                ? intl.formatMessage({
                    id: 'orders.summary.toShip',
                    defaultMessage: 'Still to ship',
                  })
                : intl.formatMessage({
                    id: 'orders.summary.toReceive',
                    defaultMessage: 'Still to receive',
                  })
            }
          >
            <strong>{inUnit(quantities.outstanding)}</strong>
          </Fact>
          {sale && (
            <Fact
              label={intl.formatMessage({
                id: 'inventory.trace.returned',
                defaultMessage: 'Returned',
              })}
              note={
                // Said only when there is something it could be added to.
                quantities.returned === '0.0000'
                  ? undefined
                  : intl.formatMessage({
                      id: 'orders.summary.returnedNote',
                      defaultMessage: 'does not add to still to ship',
                    })
              }
            >
              {inUnit(quantities.returned)}
            </Fact>
          )}
        </>
      ) : (
        <>
          <Heading>
            {intl.formatMessage({
              id: 'orders.items',
              defaultMessage: 'Items',
            })}
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
        </>
      )}

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
            {money.credited === '0.0000'
              ? formatMoney(money.credited, money.currency)
              : formatCredit(money.credited, money.currency)}
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
          {onShowDocuments && (
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={onShowDocuments}
              sx={{ alignSelf: 'flex-start', mt: 1 }}
            >
              {intl.formatMessage({
                id: 'orders.summary.seeDocuments',
                defaultMessage: 'See invoices and credits',
              })}
            </Link>
          )}
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
