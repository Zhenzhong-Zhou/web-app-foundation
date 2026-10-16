import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import type { OrderDetail, TaxCode } from '../api/types.gen';
import { FormError } from '../components/form-error';
import { PdfActions } from '../components/pdf-actions';
import { api, messageFor, withQuery } from '../lib/api';

/**
 * A pro forma invoice for a sale (ADR-071): the order as it stands, valued
 * as its invoice would be, for payment in advance, an import permit or the
 * customer's approval. Nothing is stored; each one made is recorded in the
 * order's history with its total.
 *
 * Nobody keeps a default tax code, so it is chosen here, as on an invoice
 * draft, or left out and the pro forma is untaxed. Print and Download PDF
 * are links, so the server's refusals (an unpriced line, a cancelled order)
 * arrive as a page in the new tab; the order page offers this only where
 * none applies.
 *
 * Keyed by the caller, so the choice starts empty each time it opens.
 */
export function ProFormaDialog({
  open,
  order,
  onClose,
}: {
  open: boolean;
  order: OrderDetail;
  onClose: () => void;
}) {
  const intl = useIntl();
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodeId, setTaxCodeId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void api<{ taxCodes: TaxCode[] }>('/tax-codes')
      .then((response) => {
        if (!ignore) {
          setTaxCodes(response.taxCodes.filter((code) => code.isActive));
        }
      })
      .catch((caught: unknown) => {
        // Said, not swallowed: without the codes only No tax is offered,
        // and an untaxed pro forma should not go out by accident.
        if (!ignore) setLoadError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [open]);

  const path = withQuery(`/orders/${order.id}/pro-forma`, {
    taxCodeId: taxCodeId || undefined,
  });

  // The server's refusals, said here first, with what to do (ADR-071).
  const unpriced = order.lines
    .filter((line) => line.unitPrice === null)
    .map((line) => line.sku);
  const currencies = [
    ...new Set(order.lines.map((line) => line.currency).filter(Boolean)),
  ];
  const blocked =
    unpriced.length > 0
      ? intl.formatMessage(
          {
            id: 'orders.proForma.unpriced',
            defaultMessage:
              'Every item needs a price first. {skus} {count, plural, one {has} other {have}} none: price {count, plural, one {it} other {them}} on the Items tab.',
          },
          {
            skus: intl.formatList(unpriced, {
              type: 'conjunction',
              style: 'narrow',
            }),
            count: unpriced.length,
          },
        )
      : currencies.length > 1
        ? intl.formatMessage(
            {
              id: 'orders.proForma.currencies',
              defaultMessage:
                'A pro forma is in one currency, and this order has {currencies}. Price every item in one of them.',
            },
            {
              currencies: intl.formatList(currencies, {
                type: 'conjunction',
                style: 'narrow',
              }),
            },
          )
        : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {intl.formatMessage(
          {
            id: 'orders.proForma.title',
            defaultMessage: 'Pro forma invoice for {number}',
          },
          { number: order.number },
        )}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({
              id: 'orders.proForma.help',
              defaultMessage:
                'The order as it stands today, valued as its invoice would be. It says it is not a tax invoice, and nothing is owed on it. Each one made is kept in the order’s history.',
            })}
          </Typography>

          {blocked && <Alert severity="info">{blocked}</Alert>}
          {!blocked && loadError && <FormError message={loadError} />}

          {!blocked && (
            <TextField
              id="pro-forma-tax-code"
              select
              label={intl.formatMessage({
                id: 'orders.proForma.taxCode',
                defaultMessage: 'Tax code',
              })}
              fullWidth
              value={taxCodeId}
              onChange={(event) => setTaxCodeId(event.target.value)}
              helperText={intl.formatMessage({
                id: 'orders.proForma.taxCode.help',
                defaultMessage:
                  'The one its invoice would use, for every line. Leave it out for no tax.',
              })}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
            >
              <MenuItem value="">
                {intl.formatMessage({
                  id: 'orders.proForma.noTax',
                  defaultMessage: 'No tax',
                })}
              </MenuItem>
              {taxCodes.map((code) => (
                <MenuItem key={code.id} value={code.id}>
                  {code.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="text" onClick={onClose}>
          {intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
        </Button>
        {!blocked && <PdfActions path={path} />}
      </DialogActions>
    </Dialog>
  );
}
