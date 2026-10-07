import {
  Box,
  Button,
  GlobalStyles,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { formatMoney, formatQuantity, NO_VALUE } from '../lib/format';
import type { InvoiceTax } from '../lib/types';
import { formatRate } from '../settings/tax-rate';
import { PAPER_THEME } from '../theme/paper';
import type { DocumentText } from './document-text';
import { PRINTED } from './printed-words';

/**
 * What every printed document shares (ADR-041): the browser's own Print
 * rather than a PDF library, print CSS that hides the app's chrome, and a
 * Back link and Print button that never reach the paper. Black on white
 * regardless of the theme, because a dark-mode page printed as-is wastes a
 * cartridge.
 *
 * Taken from the packing slip, which now uses it too, and shared with the
 * invoice and the credit note so the three read as one set — a customer
 * holding an invoice and its credit note should see the same layout
 * reversed, not two designs.
 */
/**
 * A printable page. The link back and the Print button are the reader's,
 * in the reader's language and hidden on paper; everything inside is the
 * document's, in its customer's (ADR-054). `languages` marks the sheet with
 * them, so a screen reader and the browser's font choice follow the
 * document rather than the page around it.
 */
export function PrintSheet({
  backTo,
  backLabel,
  languages,
  children,
}: {
  backTo: string;
  backLabel: string;
  languages: string[];
  children: ReactNode;
}) {
  const intl = useIntl();

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
        <Button onClick={() => window.print()}>
          {intl.formatMessage({
            id: 'invoices.print',
            defaultMessage: 'Print',
          })}
        </Button>
      </Stack>

      {/*
       * The document in its own theme (ADR-055), so the screen's look
       * never reaches paper. A white sheet on screen too: in dark mode the
       * page around it is dark, and the document is what prints.
       */}
      <ThemeProvider theme={PAPER_THEME}>
        <Stack
          spacing={3}
          lang={languages[0]}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            p: { xs: 2, sm: 4 },
            borderRadius: 1,
            '@media print': { p: 0 },
          }}
        >
          {children}
        </Stack>
      </ThemeProvider>
    </Stack>
  );
}

/**
 * A warning that must survive the printer: bordered, not coloured, as the
 * packing slip's VOID is — a coloured background is the first thing a
 * printer drops, and a voided invoice found in a drawer later must not
 * pass for one that is owed.
 */
/** A warning across the top of a sheet; each line is one language's. */
export function PrintBanner({
  title,
  detail,
}: {
  title: string;
  detail?: string[];
}) {
  return (
    <Box sx={{ border: 2, borderColor: 'error.main', p: 2 }}>
      <Typography variant="h6" component="p" color="error">
        {title}
      </Typography>
      {detail?.map((line) => (
        <Typography key={line} variant="body2">
          {line}
        </Typography>
      ))}
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

/** One billed line, as an invoice or a credit note prints it. */
export type PrintLine = {
  id: string;
  sku: string;
  description: string;
  /** The name in the second language, copied at issue; null for one. */
  secondDescription: string | null;
  quantity: string;
  unitPrice: string;
  taxCodeName: string | null;
  /** Before tax, from wherever each document keeps it; null shows a dash. */
  amount: string | null;
};

/**
 * The lines of an invoice or a credit note: the same columns in the same
 * order on both, so a credit reads as the invoice it reverses.
 */
export function PrintLines({
  doc,
  currency,
  lines,
}: {
  doc: DocumentText;
  currency: string;
  lines: PrintLine[];
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>{doc.label(PRINTED.sku)}</TableCell>
          <TableCell>{doc.label(PRINTED.item)}</TableCell>
          <TableCell align="right">{doc.label(PRINTED.quantity)}</TableCell>
          <TableCell align="right">{doc.label(PRINTED.unitPrice)}</TableCell>
          <TableCell>{doc.label(PRINTED.tax)}</TableCell>
          <TableCell align="right">{doc.label(PRINTED.amount)}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{line.sku}</TableCell>
            <TableCell>
              {/* Each language's name on its own line, the same weight:
                  the second is not a footnote to the first. */}
              <Typography variant="inherit" lang={doc.languages[0]}>
                {line.description}
              </Typography>
              {line.secondDescription &&
                line.secondDescription !== line.description && (
                  <Typography variant="inherit" lang={doc.languages[1]}>
                    {line.secondDescription}
                  </Typography>
                )}
            </TableCell>
            {/* Trailing zeros dropped, the separator the document's. */}
            <TableCell align="right">
              {formatQuantity(String(Number(line.quantity)), doc.locale)}
            </TableCell>
            <TableCell align="right">
              {formatMoney(line.unitPrice, currency, doc.locale)}
            </TableCell>
            <TableCell>{line.taxCodeName ?? NO_VALUE}</TableCell>
            <TableCell align="right">
              {formatMoney(line.amount, currency, doc.locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Subtotal, one line per tax, and the total — right-aligned under the
 * lines, as on any invoice. The currency code is spelled out beside the
 * total, because "$" alone is five currencies.
 */
export function PrintTotals({
  doc,
  currency,
  subtotal,
  taxes,
  total,
  totalLabel,
}: {
  doc: DocumentText;
  currency: string;
  subtotal: string | null;
  taxes: InvoiceTax[];
  total: string | null;
  /** "Total" or "Total credited", put in each of the document's languages. */
  totalLabel: MessageDescriptor;
}) {
  const money = (amount: string | null) =>
    formatMoney(amount, currency, doc.locale);

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
      {row(doc.label(PRINTED.subtotal), money(subtotal))}
      {taxes.map((tax) =>
        row(
          doc.join((intl) =>
            intl.formatMessage(
              {
                id: 'documents.taxOn',
                defaultMessage: '{tax} {rate} on {amount}',
              },
              {
                tax: tax.name,
                rate: formatRate(tax.rate, intl),
                amount: money(tax.taxableAmount),
              },
            ),
          ),
          money(tax.amount),
        ),
      )}
      {row(
        doc.join((intl) =>
          intl.formatMessage(
            {
              id: 'documents.totalIn',
              defaultMessage: '{total} ({currency})',
            },
            { total: intl.formatMessage(totalLabel), currency },
          ),
        ),
        money(total),
        true,
      )}
    </Stack>
  );
}
