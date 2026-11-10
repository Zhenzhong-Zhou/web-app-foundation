import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { ProductDetail } from '../api/types.gen';
import { NO_VALUE } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { LANGUAGE_NAMES, type Locale, SUPPORTED_LOCALES } from '../lib/locales';
import { openDialog } from '../lib/open-dialog';
import { missingNames, type NameAt, rowsOf } from './name-rows';

/**
 * Names in other languages on the item's page (ADR-092, #526): one table,
 * a row for the item and one for each variation with a name of its own, a
 * column for each language, those the organization's documents require
 * marked so. A missing required name reads Missing, with Add opening Edit
 * names at that row; a line above says documents holding it cannot print
 * until it is added. A variation with no name of its own prints the
 * item's, so it has no row.
 */
export function ItemNames({
  product,
  required,
  canEdit,
  onEdit,
}: {
  product: ProductDetail;
  required: readonly Locale[];
  canEdit: boolean;
  /** Edit names, at a row and language, or from its top. */
  onEdit: (at: NameAt | null) => void;
}) {
  const intl = useIntl();
  const titleId = useId();
  const rows = rowsOf(product);
  const missing = missingNames(product, required);
  const unnamed = product.variants.some((variant) => !variant.name);

  const rowWords = (sku: string | null) =>
    sku === null
      ? intl.formatMessage({
          id: 'products.names.row.item',
          defaultMessage: 'the item',
        })
      : intl.formatMessage(
          {
            id: 'products.names.row.variant',
            defaultMessage: 'variant {sku}',
          },
          { sku },
        );

  const nameOf = (at: { sku: string | null; locale: Locale }) =>
    intl.formatMessage(
      {
        id: 'products.names.which',
        defaultMessage: 'the {language} name of {row}',
      },
      { language: LANGUAGE_NAMES[at.locale], row: rowWords(at.sku) },
    );

  return (
    <Stack spacing={1}>
      {missing.length > 0 && (
        <Alert
          severity="warning"
          action={
            canEdit ? (
              <Button
                color="inherit"
                variant="text"
                onClick={openDialog(() => onEdit(missing[0]))}
              >
                {intl.formatMessage({
                  id: 'products.names.add',
                  defaultMessage: 'Add',
                })}
              </Button>
            ) : undefined
          }
        >
          {intl.formatMessage(
            {
              id: 'products.names.missingLine',
              defaultMessage:
                '{count, plural, one {A name documents require is missing} other {# names documents require are missing}}: {names}. Orders and invoices holding this item cannot print until {count, plural, one {it is} other {they are}} added.',
            },
            {
              count: missing.length,
              names: intl.formatList(missing.map(nameOf), {
                type: 'conjunction',
              }),
            },
          )}
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography
          id={titleId}
          variant="h6"
          component="h2"
          sx={{ flexGrow: 1 }}
        >
          {intl.formatMessage({
            id: 'products.translations.title',
            defaultMessage: 'Names in other languages',
          })}
        </Typography>

        {canEdit && (
          <Button variant="text" onClick={openDialog(() => onEdit(null))}>
            {intl.formatMessage({
              id: 'products.translations.edit',
              defaultMessage: 'Edit names',
            })}
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small" aria-labelledby={titleId}>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Box component="span" sx={HIDDEN}>
                    {intl.formatMessage({
                      id: 'products.names.of',
                      defaultMessage: 'Item or variant',
                    })}
                  </Box>
                </TableCell>
                {SUPPORTED_LOCALES.map((locale) => (
                  <TableCell key={locale}>
                    <span lang={locale}>{LANGUAGE_NAMES[locale]}</span>
                    {required.includes(locale) && (
                      <Typography
                        variant="caption"
                        component="span"
                        sx={{ display: 'block', color: 'text.secondary' }}
                      >
                        {intl.formatMessage({
                          id: 'products.names.required',
                          defaultMessage: 'Required on documents',
                        })}
                      </Typography>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell component="th" scope="row">
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ display: 'block', color: 'text.secondary' }}
                    >
                      {row.sku === null
                        ? intl.formatMessage({
                            id: 'products.names.kind.item',
                            defaultMessage: 'Item',
                          })
                        : intl.formatMessage(
                            {
                              id: 'products.names.kind.variant',
                              defaultMessage: 'Variant {sku}',
                            },
                            { sku: row.sku },
                          )}
                    </Typography>
                    {row.name}
                  </TableCell>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <TableCell key={locale}>
                      {row.names[locale] ? (
                        <span lang={locale}>{row.names[locale]}</span>
                      ) : required.includes(locale) ? (
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{ color: 'error.main', fontWeight: 600 }}
                          >
                            {intl.formatMessage({
                              id: 'products.names.missing',
                              defaultMessage: 'Missing',
                            })}
                          </Typography>
                          {canEdit && (
                            <Button
                              variant="text"
                              size="small"
                              aria-label={intl.formatMessage(
                                {
                                  id: 'products.names.addLabel',
                                  defaultMessage: 'Add {name}',
                                },
                                { name: nameOf({ sku: row.sku, locale }) },
                              )}
                              onClick={openDialog(() =>
                                onEdit({ row: row.key, locale }),
                              )}
                            >
                              {intl.formatMessage({
                                id: 'products.names.add',
                                defaultMessage: 'Add',
                              })}
                            </Button>
                          )}
                        </Stack>
                      ) : (
                        NO_VALUE
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {unnamed && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'products.names.unnamed',
            defaultMessage:
              'A variant with no name of its own prints the item’s, so it has no row here.',
          })}
        </Typography>
      )}
    </Stack>
  );
}
