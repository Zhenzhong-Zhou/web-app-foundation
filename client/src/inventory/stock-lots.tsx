import {
  Box,
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

import type { StockLotRow } from '../api/types.gen';
import { ExpiryChip } from '../components/expiry-chip';
import { LotLink } from '../components/lot-link';
import { PlaceholderRows } from '../components/placeholder-rows';
import { TableOrCards } from '../components/table-or-cards';
import { itemName, nameAndCode, NO_VALUE } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { NameAndCode } from '../products/name-and-code';
import { displayWithUnit } from '../products/units';
import { PileActions, type StockHandlers } from './stock-codes';

/** The words of its headers and figures. */
const HEADS = defineMessages({
  item: { id: 'inventory.item', defaultMessage: 'Item' },
  lot: { id: 'inventory.lot', defaultMessage: 'Lot' },
  expires: { id: 'inventory.lot.expires', defaultMessage: 'Expires' },
  location: { id: 'inventory.location', defaultMessage: 'Location' },
  quantity: { id: 'inventory.quantity', defaultMessage: 'Quantity' },
  actions: { id: 'common.actions', defaultMessage: 'Actions' },
});

/**
 * The Lot view (ADR-093, R4; 25a): a row per lot at each place, soonest
 * first, the expired on top, as the server orders it; a lot in several
 * places says so on each of its rows, "1 of 2 places", so its rows read
 * as one lot. A place's name only for a reader who may see places (A6).
 */
export function StockLots({
  rows,
  loading,
  seesPlaces,
  handlers,
}: {
  rows: StockLotRow[] | null;
  loading: boolean;
  seesPlaces: boolean;
  handlers: StockHandlers;
}) {
  const intl = useIntl();
  const numbered = withPlaceNumbers(rows ?? []);

  return (
    <TableOrCards
      loading={loading}
      table={
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{intl.formatMessage(HEADS.item)}</TableCell>
                <TableCell>{intl.formatMessage(HEADS.lot)}</TableCell>
                <TableCell>{intl.formatMessage(HEADS.expires)}</TableCell>
                {seesPlaces && (
                  <TableCell>{intl.formatMessage(HEADS.location)}</TableCell>
                )}
                <TableCell align="right">
                  {intl.formatMessage(HEADS.quantity)}
                </TableCell>
                {/* Every header named (R6), this one to a screen reader:
                    each row's button says its word. */}
                <TableCell padding="checkbox">
                  <Box component="span" sx={HIDDEN}>
                    {intl.formatMessage(HEADS.actions)}
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <PlaceholderRows columns={seesPlaces ? 6 : 5} />}
              {numbered.map(({ row, index }) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <NameAndCode
                      name={itemName(row.productName, row.variantName)}
                      code={row.sku}
                      withType
                      type={row.type}
                      coverFileId={row.coverFileId}
                      to={`/items/${row.productId}`}
                    />
                  </TableCell>
                  <TableCell>
                    {row.lotId && row.lotCode ? (
                      <LotLink id={row.lotId} code={row.lotCode} />
                    ) : (
                      NO_VALUE
                    )}
                    {/* Without places, why it is not usable, never where
                        (A6). */}
                    {!seesPlaces && !row.isAvailable && <NotUsable />}
                  </TableCell>
                  <TableCell>
                    <ExpiryChip expiresAt={row.lotExpiresAt} />
                  </TableCell>
                  {seesPlaces && (
                    <TableCell>
                      <Where row={row} index={index} />
                    </TableCell>
                  )}
                  <TableCell align="right">
                    {displayWithUnit(row.quantity, row.unitOfMeasure, intl)}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <PileActions pile={row} handlers={handlers} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      }
      cards={
        <Stack component="ul" sx={{ m: 0, p: 0 }}>
          {numbered.map(({ row, index }) => (
            <Box
              component="li"
              key={row.id}
              sx={{
                listStyle: 'none',
                p: 2,
                '& + &': { borderTop: 1, borderColor: 'divider' },
              }}
            >
              <Stack spacing={1}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <NameAndCode
                    name={itemName(row.productName, row.variantName)}
                    code={row.sku}
                    withType
                    type={row.type}
                    coverFileId={row.coverFileId}
                    to={`/items/${row.productId}`}
                  />
                  <span>
                    {displayWithUnit(row.quantity, row.unitOfMeasure, intl)}
                  </span>
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                >
                  {row.lotId && row.lotCode && (
                    <LotLink id={row.lotId} code={row.lotCode} />
                  )}
                  <ExpiryChip expiresAt={row.lotExpiresAt} />
                  <Box sx={{ flex: 1 }} />
                  <PileActions pile={row} handlers={handlers} />
                </Stack>
                {seesPlaces ? (
                  <Where row={row} index={index} />
                ) : (
                  !row.isAvailable && <NotUsable />
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      }
    />
  );
}

/** Each row with which of its lot's places it is, by the rows read so far. */
function withPlaceNumbers(
  rows: StockLotRow[],
): { row: StockLotRow; index: number }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const index = (seen.get(row.lotId ?? row.id) ?? 0) + 1;
    seen.set(row.lotId ?? row.id, index);
    return { row, index };
  });
}

/** The place, "1 of 2 places" when its lot is in several, and why not usable. */
function Where({ row, index }: { row: StockLotRow; index: number }) {
  const intl = useIntl();

  return (
    <Stack>
      <span>{nameAndCode(row.locationName ?? '', row.locationCode)}</span>
      {row.places > 1 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.lots.placeOf',
              defaultMessage: '{index} of {count} places',
            },
            { index: Math.min(index, row.places), count: row.places },
          )}
        </Typography>
      )}
      {!row.isAvailable && <NotUsable />}
    </Stack>
  );
}

/** "Not usable: a place not available", in the critical tone (ADR-093). */
function NotUsable() {
  const intl = useIntl();
  return (
    <Typography variant="body2" sx={{ color: 'error.main' }}>
      {intl.formatMessage({
        id: 'inventory.stock.notAvailable',
        defaultMessage: 'Not usable: a place not available',
      })}
    </Typography>
  );
}
