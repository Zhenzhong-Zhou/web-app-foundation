import {
  Box,
  Button,
  GlobalStyles,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { formatMoney } from '../lib/format';
import type { InvoiceTax } from '../lib/types';
import { formatRate } from '../settings/tax-rate';

/**
 * What every printed document shares, taken from the packing slip
 * (ADR-041): the browser's own Print rather than a PDF library, print CSS
 * that hides the app's chrome and forces black on white, and a Back link
 * and Print button that never reach the paper.
 *
 * Shared by the invoice and the credit note so the two read as one set —
 * a customer holding both should see the same layout reversed, not two
 * designs.
 */
export function PrintSheet({
  backTo,
  backLabel,
  children,
}: {
  backTo: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 800 }}>
      <GlobalStyles
        styles={{
          '@media print': {
            'header, nav, .no-print': { display: 'none !important' },
            body: { background: '#fff !important', color: '#000 !important' },
            '@page': { margin: '16mm' },
          },
        }}
      />

      <Stack
        direction="row"
        spacing={2}
        className="no-print"
        sx={{ alignItems: 'center' }}
      >
        <Link component={RouterLink} to={backTo}>
          {backLabel}
        </Link>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={() => window.print()}>Print</Button>
      </Stack>

      {children}
    </Stack>
  );
}

/**
 * A warning that must survive the printer: bordered, not coloured, as the
 * packing slip's VOID is — a coloured background is the first thing a
 * printer drops, and a voided invoice found in a drawer later must not
 * pass for one that is owed.
 */
export function PrintBanner({
  title,
  detail,
}: {
  title: string;
  detail?: ReactNode;
}) {
  return (
    <Box sx={{ border: 2, borderColor: 'error.main', p: 2 }}>
      <Typography variant="h6" component="p" color="error">
        {title}
      </Typography>
      {detail && <Typography variant="body2">{detail}</Typography>}
    </Box>
  );
}

/** A name and an address, one line per part, as a letter is addressed. */
export function PrintParty({
  heading,
  name,
  lines,
  extra,
}: {
  heading: string;
  name: string | null;
  lines: (string | null)[];
  extra?: ReactNode;
}) {
  const [line1, line2, city, region, postalCode, country] = lines;

  return (
    <Box>
      <Typography variant="overline">{heading}</Typography>
      {name && <Typography>{name}</Typography>}
      {line1 && <Typography>{line1}</Typography>}
      {line2 && <Typography>{line2}</Typography>}
      {(city || region || postalCode) && (
        <Typography>
          {[city, region, postalCode].filter(Boolean).join(', ')}
        </Typography>
      )}
      {country && <Typography>{country}</Typography>}
      {extra}
    </Box>
  );
}

/**
 * Subtotal, one line per tax, and the total — right-aligned under the
 * lines, as on any invoice. The currency code is spelled out beside the
 * total, because "$" alone is five currencies.
 */
export function PrintTotals({
  currency,
  subtotal,
  taxes,
  total,
  totalLabel,
}: {
  currency: string;
  subtotal: string | null;
  taxes: InvoiceTax[];
  total: string | null;
  totalLabel: string;
}) {
  const row = (label: string, amount: string, strong = false) => (
    <Stack
      key={label}
      direction="row"
      spacing={4}
      sx={{ minWidth: 280, justifyContent: 'space-between' }}
    >
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : undefined }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : undefined }}>
        {amount}
      </Typography>
    </Stack>
  );

  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
      {row('Subtotal', formatMoney(subtotal, currency))}
      {taxes.map((tax) =>
        row(
          `${tax.name} ${formatRate(tax.rate)} on ${formatMoney(tax.taxableAmount, currency)}`,
          formatMoney(tax.amount, currency),
        ),
      )}
      {row(`${totalLabel} (${currency})`, formatMoney(total, currency), true)}
    </Stack>
  );
}
