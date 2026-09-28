import { Paper, Stack, Typography } from '@mui/material';

import type { InvoiceDetail } from '../lib/types';
import { oneLine } from './calendar-day';

/** Who issued it and who pays, as they were copied at issue. */
export function Parties({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
        <Typography variant="overline">From</Typography>
        <Typography variant="body2">{invoice.sellerName}</Typography>
        <Typography variant="body2">
          {oneLine([
            invoice.sellerLine1,
            invoice.sellerLine2,
            invoice.sellerCity,
            invoice.sellerRegion,
            invoice.sellerPostalCode,
            invoice.sellerCountry,
          ])}
        </Typography>
        {invoice.sellerTaxNumber && (
          <Typography variant="body2" color="text.secondary">
            Tax number {invoice.sellerTaxNumber}
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
        <Typography variant="overline">Bill to</Typography>
        <Typography variant="body2">{invoice.billToName}</Typography>
        <Typography variant="body2">
          {oneLine([
            invoice.billToLine1,
            invoice.billToLine2,
            invoice.billToCity,
            invoice.billToRegion,
            invoice.billToPostalCode,
            invoice.billToCountry,
          ])}
        </Typography>
      </Paper>

      {invoice.shipToLine1 && (
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">Shipped to</Typography>
          {invoice.shipToLabel && (
            <Typography variant="body2">{invoice.shipToLabel}</Typography>
          )}
          <Typography variant="body2">
            {oneLine([
              invoice.shipToLine1,
              invoice.shipToLine2,
              invoice.shipToCity,
              invoice.shipToRegion,
              invoice.shipToPostalCode,
              invoice.shipToCountry,
            ])}
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}
