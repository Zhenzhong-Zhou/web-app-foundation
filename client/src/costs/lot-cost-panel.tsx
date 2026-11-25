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
import type { ReactNode } from 'react';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { LotCost, LotCostEntry } from '../api/types.gen';
import { LabelledValue } from '../components/labelled-value';
import { LotLink } from '../components/lot-link';
import {
  displayQuantity,
  formatDate,
  formatMoney,
  formatQuantity,
  formatUnitCost,
  NO_VALUE,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

const WORDS = defineMessages({
  opening: { id: 'costs.entry.opening', defaultMessage: 'Opening balance' },
  run_close: {
    id: 'costs.entry.runClose',
    defaultMessage: 'Batch cost at close',
  },
  correction: {
    id: 'costs.entry.correction',
    defaultMessage: 'Cost set or corrected',
  },
  issued: {
    id: 'costs.entry.issued',
    defaultMessage: 'Cost of stock already gone',
  },
  receipt: { id: 'orders.status.received', defaultMessage: 'Received' },
  production: { id: 'costs.entry.made', defaultMessage: 'Made' },
  consumption: { id: 'costs.entry.usedInRun', defaultMessage: 'Used in a run' },
  shipment: { id: 'orders.status.shipped', defaultMessage: 'Shipped' },
  sample: { id: 'costs.entry.sampled', defaultMessage: 'Sampled' },
  return: { id: 'inventory.trace.returned', defaultMessage: 'Returned' },
  countedOut: { id: 'costs.entry.countedOut', defaultMessage: 'Counted out' },
  countedIn: { id: 'costs.entry.countedIn', defaultMessage: 'Counted in' },
  fromBefore: {
    id: 'costs.entry.fromBefore',
    defaultMessage: 'Back from before lot tracking',
  },
  other: { id: 'costs.entry.other', defaultMessage: 'Other change' },
});

/**
 * What a valuation row was, in words, in the reader's language (ADR-054). A
 * sign test on the string, not arithmetic (ADR-025): an inbound adjustment
 * is positive, an outbound one negative, as a lot change's row in and its
 * row out are. A late cost carried with stock moved between lots names
 * the other lot, whichever way it went (ADR-094, D5). A kind or a reason
 * this tab does not know reads "Other change", never its stored key
 * (D4). The other lot is a link to its page.
 */
function describe(entry: LotCostEntry, intl: IntlShape): ReactNode {
  const what = described(entry, intl);
  // A return with no cost it shipped at, valued at the lot's average when
  // it came back, says so (#661).
  return entry.atPoolAverage
    ? intl.formatMessage(
        {
          id: 'costs.entry.atLotAverage',
          defaultMessage: '{what}, at the lot’s average',
        },
        { what },
      )
    : what;
}

/** The row's own words, before the mark of how it was valued. */
function described(entry: LotCostEntry, intl: IntlShape): ReactNode {
  const out = entry.quantity.startsWith('-');
  // The other lot a link to its page, with Back (v17's board; review 34).
  const other =
    entry.otherLotId && entry.otherLotCode ? (
      <LotLink key="lot" id={entry.otherLotId} code={entry.otherLotCode} />
    ) : (
      entry.otherLotCode
    );
  if (entry.carried && entry.otherLotCode) {
    return entry.carried === 'to'
      ? intl.formatMessage(
          {
            id: 'costs.entry.carriedTo',
            defaultMessage: 'Cost carried to lot {code}',
          },
          { code: other },
        )
      : intl.formatMessage(
          {
            id: 'costs.entry.carriedFrom',
            defaultMessage: 'Cost from lot {code}',
          },
          { code: other },
        );
  }

  switch (entry.kind) {
    case 'opening':
    case 'run_close':
    case 'correction':
    case 'issued':
      return intl.formatMessage(WORDS[entry.kind]);
    case 'lot_change':
      if (entry.otherLotCode) {
        return out
          ? intl.formatMessage(
              {
                id: 'costs.entry.movedTo',
                defaultMessage: 'Moved to lot {code}',
              },
              { code: other },
            )
          : intl.formatMessage(
              {
                id: 'costs.entry.movedInFrom',
                defaultMessage: 'Moved in from lot {code}',
              },
              { code: other },
            );
      }
      return intl.formatMessage(out ? WORDS.other : WORDS.fromBefore);
    case 'movement':
      break;
    default:
      return intl.formatMessage(WORDS.other);
  }

  switch (entry.reason) {
    case 'receipt':
    case 'production':
    case 'consumption':
    case 'shipment':
    case 'sample':
    case 'return':
      return intl.formatMessage(WORDS[entry.reason]);
    case 'adjustment':
      return intl.formatMessage(out ? WORDS.countedOut : WORDS.countedIn);
    default:
      return intl.formatMessage(WORDS.other);
  }
}

/**
 * What was paid, in its own currency: the base currency's as the panel's
 * other money, any other with its code, "USD 4.20", since a symbol such
 * as $ names more than one (ADR-055; #472's 24).
 */
function paid(entry: LotCostEntry, base: string | null): string {
  return formatUnitCost(
    entry.unitPrice,
    entry.currency,
    undefined,
    entry.currency === base ? 'symbol' : 'code',
  );
}

/**
 * What one lot is worth and how it got there (ADR-048): its pool, and the
 * valuation rows that made it, newest first.
 *
 * Read-only. Setting a missing cost happens on the Stock value page, which
 * is where the to-do list lives; this links there when the lot is waiting.
 */
export function LotCostPanel({ lotId }: { lotId: string }) {
  const intl = useIntl();
  const { data, error, loading } = useResource<{ lotCost: LotCost }>(
    `/costs/lots/${lotId}`,
  );
  const cost = data?.lotCost ?? null;

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
          <FormattedMessage
            id="costs.lot.waiting"
            defaultMessage="Part of this lot is still waiting for a cost. Set it on the <link>Stock value</link> page."
            values={{
              link: (chunks: ReactNode[]) => (
                <Link
                  underline="always"
                  component={RouterLink}
                  to="/costs"
                  state={OFFER_BACK}
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={4}>
          <LabelledValue
            label={intl.formatMessage({
              id: 'costs.unitCost',
              defaultMessage: 'Unit cost',
            })}
            value={
              cost.unitCost === null
                ? intl.formatMessage({
                    id: 'costs.noneOnHand',
                    defaultMessage: 'None on hand',
                  })
                : formatUnitCost(cost.unitCost, currency)
            }
          />
          <LabelledValue
            label={intl.formatMessage({
              id: 'common.onHand',
              defaultMessage: 'On hand',
            })}
            value={displayQuantity(cost.quantity)}
          />
          <LabelledValue
            label={intl.formatMessage({
              id: 'costs.value',
              defaultMessage: 'Value',
            })}
            value={formatMoney(cost.value, currency)}
          />
        </Stack>
      </Paper>

      {cost.entries.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table
              size="small"
              aria-label={intl.formatMessage({
                id: 'costs.lot.history',
                defaultMessage: 'How its value changed',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.movements.when',
                      defaultMessage: 'When',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'account.activity.what',
                      defaultMessage: 'What',
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
                  <TableCell>
                    {intl.formatMessage({
                      id: 'costs.paid',
                      defaultMessage: 'Paid',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cost.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    <TableCell>
                      {describe(entry, intl)}
                      {entry.needsCost && (
                        <Chip
                          size="small"
                          label={intl.formatMessage({
                            id: 'costs.needsCost',
                            defaultMessage: 'Waiting for a cost',
                          })}
                          color="warning"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {entry.kind === 'movement' ||
                      entry.kind === 'opening' ||
                      entry.kind === 'lot_change'
                        ? displayQuantity(entry.quantity)
                        : NO_VALUE}
                    </TableCell>
                    <TableCell align="right">
                      {formatMoney(entry.value, currency)}
                    </TableCell>
                    <TableCell>
                      {entry.unitPrice
                        ? entry.exchangeRate
                          ? intl.formatMessage(
                              {
                                id: 'costs.paidAtRate',
                                defaultMessage: '{price} at {rate}',
                              },
                              {
                                price: paid(entry, currency),
                                // Trailing zeros dropped on the string, then
                                // the language's decimal separator.
                                rate: formatQuantity(
                                  entry.exchangeRate.replace(/\.?0+$/, ''),
                                ),
                              },
                            )
                          : paid(entry, currency)
                        : NO_VALUE}
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
