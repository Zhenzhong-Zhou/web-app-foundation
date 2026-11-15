import {
  Alert,
  Box,
  Button,
  Link,
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
import { type ReactNode, useId } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { ProductDetail } from '../api/types.gen';
import { NO_VALUE } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import {
  LANGUAGE_NAMES,
  languageWord,
  type Locale,
  SUPPORTED_LOCALES,
} from '../lib/locales';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { ITEM_NAMES_HASH } from './name-language';
import { type NameAt, rowsOf } from './name-rows';

/**
 * Names in other languages on the item's page (ADR-092, #526): one table,
 * a row for the item and one for each variation with a name of its own, a
 * column for each language, those the organization's documents require
 * marked so. A missing required name reads Missing, with Add opening Edit
 * names at that row; a line above says documents holding it cannot print
 * until it is added. A variation with no name of its own prints the
 * item's, so it has no row.
 *
 * The language items are named in comes first, once it is set: its
 * column holds each row's own name, which is the name there, marked as
 * the own one, never Missing (ADR-054, amended for #531). While it is not
 * set, the own name is marked as the own one in its row, and a line above
 * the table, its description, says why no language holds it, and where
 * it is chosen: a link there for whoever may choose it. What is missing
 * is the server's, worked out as documents refuse (#551's 65).
 */
export function ItemNames({
  product,
  required,
  language,
  canEdit,
  canChoose,
  onEdit,
}: {
  product: ProductDetail;
  required: readonly Locale[];
  /** The language items are named in; null while it is not set. */
  language: Locale | null;
  canEdit: boolean;
  /** May choose the items' language: the line while not set links to it. */
  canChoose: boolean;
  /** Edit names, at a row and language, or from its top. */
  onEdit: (at: NameAt | null) => void;
}) {
  const intl = useIntl();
  const titleId = useId();
  const notSetId = useId();
  const rows = rowsOf(product);
  const missing = product.missingNames.map((name) => ({
    row: name.variantId ?? 'product',
    sku: name.sku,
    locale: name.locale,
  }));
  const isMissing = (row: string, locale: Locale) =>
    missing.some((name) => name.row === row && name.locale === locale);
  const columns = language
    ? [language, ...SUPPORTED_LOCALES.filter((locale) => locale !== language)]
    : SUPPORTED_LOCALES;
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

  // A label, not a status: muted, as Required on documents is.
  const ownLabel = (sku: string | null) => (
    <Typography
      variant="caption"
      component="span"
      sx={{ display: 'block', color: 'text.secondary' }}
    >
      {intl.formatMessage(
        {
          id: 'products.names.own',
          defaultMessage:
            '{kind, select, variant {Variant’s own name} other {Item’s own name}}',
        },
        { kind: sku === null ? 'item' : 'variant' },
      )}
    </Typography>
  );

  const nameOf = (at: { sku: string | null; locale: Locale }) =>
    intl.formatMessage(
      {
        id: 'products.names.which',
        defaultMessage: 'the {language} name of {row}',
      },
      { language: languageWord(at.locale, intl.locale), row: rowWords(at.sku) },
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

      {!language && (
        <Typography
          id={notSetId}
          variant="body2"
          sx={{ color: 'text.secondary' }}
        >
          {canChoose
            ? intl.formatMessage(
                {
                  id: 'products.names.notSet.choose',
                  defaultMessage:
                    'The language items are named in isn’t chosen yet, so an item’s own name doesn’t count as its name in any language. Choose it in <link>Organization → Documents</link>.',
                },
                {
                  link: (chunks: ReactNode[]) => (
                    <Link
                      component={RouterLink}
                      to={`/settings/organization?tab=documents${ITEM_NAMES_HASH}`}
                      state={OFFER_BACK}
                      underline="always"
                    >
                      {chunks}
                    </Link>
                  ),
                },
              )
            : intl.formatMessage({
                id: 'products.names.notSet.ask',
                defaultMessage:
                  'The language items are named in isn’t chosen yet, so an item’s own name doesn’t count as its name in any language. Someone who can change the organization’s settings can choose it in Organization → Documents.',
              })}
        </Typography>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table
            size="small"
            aria-labelledby={titleId}
            aria-describedby={language ? undefined : notSetId}
          >
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
                {columns.map((locale) => (
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
                    {!language && ownLabel(row.sku)}
                  </TableCell>
                  {columns.map((locale) => (
                    <TableCell key={locale}>
                      {locale === language ? (
                        <>
                          <span lang={locale}>{row.name}</span>
                          {ownLabel(row.sku)}
                        </>
                      ) : row.names[locale] ? (
                        <span lang={locale}>{row.names[locale]}</span>
                      ) : isMissing(row.key, locale) ? (
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
