import {
  Box,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { OrderReceipt } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { CardLine } from '../components/card-line';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { NUMBER_COLUMN } from '../components/number-column';
import { PlaceholderRows } from '../components/placeholder-rows';
import { TableOrCards } from '../components/table-or-cards';
import {
  Figure,
  MovementBy,
  MovementItem,
  MovementLot,
  MovementWhen,
} from '../inventory/movement-cells';
import { MOVEMENT_HEADINGS } from '../inventory/movement-reasons';
import { movementsPath } from '../inventory/movements-path';
import { PlacePath } from '../inventory/place-path';
import { withQuery } from '../lib/api';
import { OFFER_BACK } from '../lib/offer-back';
import { useKeysetList } from '../lib/use-keyset-list';
import { wholeOnFocus } from '../lib/whole-on-focus';

/** A page of receipts, as Movements pages (ADR-093). */
const PAGE_SIZE = 25;

const WORDS = defineMessages({
  received: { id: 'orders.receipts.received', defaultMessage: 'Received' },
  none: {
    id: 'orders.receipts.none',
    defaultMessage: 'Nothing has been received on this order yet.',
  },
});

/**
 * All movements of an order, Movements filtered to it by the address's
 * key (ADR-093, R25; 95a): its receipts on a purchase, its shipments and
 * returns on a sale. Only for a reader with stock.view, which Movements
 * needs; the order's page asks orders.view already.
 */
export function AllMovementsOf({
  orderId,
  number,
}: {
  orderId: string;
  number: string;
}) {
  const intl = useIntl();
  const can = useCan();
  if (!can('stock.view')) return null;

  return (
    <Link
      component={RouterLink}
      to={movementsPath({ orderId })}
      state={OFFER_BACK}
      sx={{ alignSelf: 'flex-start' }}
    >
      {intl.formatMessage(
        {
          id: 'orders.allMovements',
          defaultMessage: 'All movements of {number}',
        },
        { number },
      )}
    </Link>
  );
}

/** Where a receipt went, by its path (93a). */
function ReceiptWhere({ receipt }: { receipt: OrderReceipt }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <PlacePath
        place={{
          locationName: receipt.toLocationName,
          locationCode: receipt.toLocationCode,
          locationPath: receipt.toLocationPath,
        }}
      />
    </Box>
  );
}

/**
 * A purchase order's receipts (ADR-093, R25; 55a): what was received on
 * it, newest first, each with its day, the item, how much, where it went,
 * its lot and who, read as Movements lists the order, so the two never
 * differ, then All movements of PO-…. Its own read, under orders.view,
 * so whoever sees the order sees them (102a); the place only for a reader
 * who may see places (96a). Mounted while its tab is open, so a receipt
 * on the Items tab is listed when the tab opens again.
 */
export function OrderReceipts({
  orderId,
  number,
}: {
  orderId: string;
  number: string;
}) {
  const intl = useIntl();
  const can = useCan();
  const places = can('locations.view');
  const list = useKeysetList<OrderReceipt>(
    withQuery(`/orders/${orderId}/receipts`, { limit: String(PAGE_SIZE) }),
  );
  const rows = list.entries;
  const head = (key: keyof typeof MOVEMENT_HEADINGS) =>
    intl.formatMessage(MOVEMENT_HEADINGS[key]);

  return (
    <Stack spacing={2}>
      {list.failed && <ListError error={list.error} onRetry={list.reload} />}

      {!list.failed && rows?.length === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(WORDS.none)}
        </Typography>
      )}

      {!list.failed && (list.loading || !!rows?.length) && (
        <TableOrCards
          loading={list.loading}
          table={
            <TableContainer onFocus={wholeOnFocus}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{head('when')}</TableCell>
                    <TableCell>{head('item')}</TableCell>
                    <TableCell {...NUMBER_COLUMN}>
                      {intl.formatMessage(WORDS.received)}
                    </TableCell>
                    {places && <TableCell>{head('where')}</TableCell>}
                    <TableCell>{head('lot')}</TableCell>
                    <TableCell>{head('by')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {list.loading && <PlaceholderRows columns={places ? 6 : 5} />}
                  {rows?.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <MovementWhen movement={movement} />
                      </TableCell>
                      <TableCell>
                        <MovementItem movement={movement} />
                      </TableCell>
                      <TableCell align="right">
                        <Figure
                          quantity={movement.received}
                          movement={movement}
                        />
                      </TableCell>
                      {places && (
                        <TableCell>
                          <ReceiptWhere receipt={movement} />
                        </TableCell>
                      )}
                      <TableCell>
                        <MovementLot movement={movement} />
                      </TableCell>
                      <TableCell>
                        <MovementBy movement={movement} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          }
          cards={
            <Stack component="ul" sx={{ m: 0, p: 0 }}>
              {rows?.map((movement) => (
                <Box
                  component="li"
                  key={movement.id}
                  sx={{
                    listStyle: 'none',
                    py: 2,
                    '& + &': { borderTop: 1, borderColor: 'divider' },
                  }}
                >
                  <Stack spacing={1}>
                    <MovementItem movement={movement} />
                    <CardLine label={head('when')}>
                      <MovementWhen movement={movement} />
                    </CardLine>
                    <CardLine label={intl.formatMessage(WORDS.received)}>
                      <Figure
                        quantity={movement.received}
                        movement={movement}
                      />
                    </CardLine>
                    {places && (
                      <CardLine label={head('where')}>
                        <ReceiptWhere receipt={movement} />
                      </CardLine>
                    )}
                    <CardLine label={head('lot')}>
                      <MovementLot movement={movement} />
                    </CardLine>
                    <CardLine label={head('by')}>
                      <MovementBy movement={movement} />
                    </CardLine>
                  </Stack>
                </Box>
              ))}
            </Stack>
          }
        />
      )}

      {!list.failed && rows && (
        <LoadMoreButton
          hasMore={list.hasMore}
          loading={list.loadingMore}
          failed={!!list.error}
          pageSize={PAGE_SIZE}
          onLoadMore={list.loadMore}
        />
      )}

      <AllMovementsOf orderId={orderId} number={number} />
    </Stack>
  );
}
