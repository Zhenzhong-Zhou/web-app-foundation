import {
  Alert,
  Button,
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
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { RecipePanel } from '../boms/recipe-panel';
import { PageHeader } from '../components/page-header';
import { LoadFailure } from '../errors/load-failure';
import { api, messageFor } from '../lib/api';
import { LANGUAGE_NAMES, type Locale } from '../lib/locales';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { AddVariantDialog } from './add-variant-dialog';
import { EditVariantDialog } from './edit-variant-dialog';
import { productTypeLabel } from './product-types';
import type { Product, Variant } from './products-page';
import { TranslationsDialog } from './translations-dialog';
import { VariantRow } from './variant-row';

/** A product's name and description in one language (ADR-054). */
export interface ProductTranslation {
  locale: Locale;
  name: string;
  description: string | null;
}

export interface ProductDetail extends Product {
  translations: ProductTranslation[];
  variants: Variant[];
}

export function ProductDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const can = useCan();

  const {
    data: product,
    error,
    failure,
    setError,
    loading,
    reload,
  } = useResource<ProductDetail>(`/products/${id!}`);
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [translating, setTranslating] = useState(false);

  // The SKU being edited, and its draft value. One at a time: editing several
  // rows before saving any would need a dirty-state map and a way to discard,
  // which is more machinery than a rare correction deserves.
  const [editing, setEditing] = useState<{ id: string; sku: string } | null>(
    null,
  );
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);

  const showSkeleton = useDelayedFlag(loading);

  const canEdit = can('products.update');

  async function patchProduct(body: Record<string, unknown>) {
    setSaving('product');
    setError(null);

    try {
      await api(`/products/${id!}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(null);
    }
  }

  async function patchVariant(
    variantId: string,
    body: Record<string, unknown>,
  ) {
    setSaving(variantId);
    setError(null);

    try {
      await api(`/products/${id!}/variants/${variantId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await reload();
      setEditing(null);
    } catch (caught) {
      // 409 when the new SKU is taken. Not caught before sending: the client
      // cannot know what every other variant in the organization is called.
      setError(messageFor(caught));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Stack spacing={2}>
        {showSkeleton ? (
          <>
            <Skeleton height={40} width={240} />
            <Skeleton height={120} />
          </>
        ) : null}
      </Stack>
    );
  }

  if (error && !product) {
    return (
      <LoadFailure
        failure={failure}
        message={error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.product',
          defaultMessage: "This product doesn't exist",
        })}
        list={{
          to: '/products',
          label: intl.formatMessage({
            id: 'layout.nav.products',
            defaultMessage: 'Products',
          }),
        }}
        onRetry={() => void reload()}
      />
    );
  }

  // Narrows for everything below. The loading and error branches above cover
  // the only two ways product stays null.
  if (!product) return null;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.products',
              defaultMessage: 'Products',
            }),
            to: '/products',
          },
        ]}
        title={product.name}
        status={{
          label: productTypeLabel(product.type, intl),
          color: 'default',
        }}
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryButton resourceId={product.id} />
            {canEdit && (
              // Discontinuing, not deleting. The product's flag is never
              // cascaded to its variants: reactivating could not then know
              // which had been individually discontinued first (ADR-023).
              <Button
                variant="text"
                disabled={saving !== null}
                onClick={() =>
                  void patchProduct({ isActive: !product.isActive })
                }
              >
                {product.isActive
                  ? intl.formatMessage({
                      id: 'products.discontinue',
                      defaultMessage: 'Discontinue',
                    })
                  : intl.formatMessage({
                      id: 'products.reactivate',
                      defaultMessage: 'Reactivate',
                    })}
              </Button>
            )}
          </Stack>
        }
        subtitle={product.description ?? undefined}
      />

      {error && <Alert severity="error">{error}</Alert>}

      {!product?.isActive && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'products.discontinuedNotice',
            defaultMessage:
              'This product is discontinued. Its variants keep their own status, so reactivating restores each to what it was.',
          })}
        </Alert>
      )}

      {/* What documents print in each language (ADR-054). Shown when there
          is something to show, or someone who could add it. */}
      {(product.translations.length > 0 || canEdit) && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
              {intl.formatMessage({
                id: 'products.translations.title',
                defaultMessage: 'Names in other languages',
              })}
            </Typography>

            {canEdit && (
              <Button
                variant="text"
                onClick={openDialog(() => setTranslating(true))}
              >
                {intl.formatMessage({
                  id: 'products.translations.edit',
                  defaultMessage: 'Edit names',
                })}
              </Button>
            )}
          </Stack>

          {product.translations.length > 0 ? (
            product.translations.map((row) => (
              <Typography key={row.locale} variant="body2">
                {/* The component, not intl.formatMessage: a value that is an
                    element comes back as a list, which React would want keys
                    for. */}
                <FormattedMessage
                  id="products.translations.line"
                  defaultMessage="{language}: {name}"
                  values={{
                    language: LANGUAGE_NAMES[row.locale] ?? row.locale,
                    name: <span lang={row.locale}>{row.name}</span>,
                  }}
                />
              </Typography>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'products.translations.none',
                defaultMessage:
                  'None yet: every document prints the name above.',
              })}
            </Typography>
          )}
        </Stack>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'products.variants',
            defaultMessage: 'Variants',
          })}
        </Typography>

        {canEdit && (
          <Button onClick={openDialog(() => setAdding(true))}>
            {intl.formatMessage({
              id: 'products.variant.add',
              defaultMessage: 'Add variant',
            })}
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.sku',
                    defaultMessage: 'SKU',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.variationColumn',
                    defaultMessage: 'Variation',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.unit',
                    defaultMessage: 'Unit',
                  })}
                </TableCell>
                <TableCell align="right">
                  {intl.formatMessage({
                    id: 'products.perCase',
                    defaultMessage: 'Per case',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.lots',
                    defaultMessage: 'Lots',
                  })}
                </TableCell>
                <TableCell align="center">
                  {intl.formatMessage({
                    id: 'common.active',
                    defaultMessage: 'Active',
                  })}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableHead>

            <TableBody>
              {product?.variants.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  canEdit={canEdit}
                  saving={saving}
                  editing={editing}
                  onStartEdit={() =>
                    setEditing({ id: variant.id, sku: variant.sku })
                  }
                  onEditChange={(sku) => setEditing({ id: variant.id, sku })}
                  onCommitSku={() => {
                    if (editing && editing.sku !== variant.sku) {
                      void patchVariant(variant.id, { sku: editing.sku });
                    } else {
                      setEditing(null);
                    }
                  }}
                  onToggleActive={() =>
                    void patchVariant(variant.id, {
                      isActive: !variant.isActive,
                    })
                  }
                  onOpenEdit={() => setEditingVariant(variant)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Below the variants, not above: a recipe outputs one variant, so the
          reader has to have met them first. The panel owns its own data and
          renders nothing without boms.view, so there is no permission check
          or reload to wire here. */}
      {product && <RecipePanel variants={product.variants} />}

      <AddVariantDialog
        open={adding}
        productId={id!}
        onClose={() => setAdding(false)}
        onCreated={reload}
      />

      <TranslationsDialog
        open={translating}
        product={product}
        onClose={() => setTranslating(false)}
        onSaved={reload}
      />

      <EditVariantDialog
        open={editingVariant !== null}
        productId={id!}
        variant={editingVariant}
        onClose={() => setEditingVariant(null)}
        onSaved={reload}
      />
    </Stack>
  );
}
