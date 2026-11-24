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
import { useEffect, useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useLocation, useNavigationType, useParams } from 'react-router-dom';

import type {
  OrganizationEnvelope,
  ProductCategoryList,
  ProductDetail,
} from '../api/types.gen';
import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { RecipePanel } from '../boms/recipe-panel';
import { PageHeader } from '../components/page-header';
import { LoadFailure } from '../errors/load-failure';
import { api, messageFor } from '../lib/api';
import { SEPARATOR } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useRecordOpened } from '../lib/recent';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { AddVariantDialog } from './add-variant-dialog';
import { EditItemDialog } from './edit-item-dialog';
import { EditVariantDialog } from './edit-variant-dialog';
import { categoryPlaces, pathName } from './item-list';
import { ItemNames } from './item-names';
import type { NameAt } from './name-rows';
import { ProductGallery } from './product-gallery';
import { productTypeSingular } from './product-types';
import type { Variant } from './products-page';
import { StartTrackingDialog } from './start-tracking-dialog';
import { TranslationsDialog } from './translations-dialog';
import { VariantRow } from './variant-row';
import { WhereItStands } from './where-it-stands';

/** The product's detail and translations, generated (ADR-068). */
export type { ProductDetail, ProductTranslation } from '../api/types.gen';

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
  // Remembered as recently opened, once loaded (ADR-058).
  useRecordOpened('product', id, product !== null && product !== undefined);
  // Arrived by a link, focus on the title, where the page begins (ADR-093's
  // item's page table); a link to one of its parts, #held, focuses that
  // part instead, and Back or a reload leaves focus to the browser.
  const heading = useRef<HTMLHeadingElement>(null);
  const arrival = useNavigationType();
  const { hash, key } = useLocation();
  const loaded = !!product;
  useEffect(() => {
    if (loaded && arrival === 'PUSH' && !hash) heading.current?.focus();
  }, [loaded, arrival, hash, key]);
  // Its category's path under its name, and Edit's list (ADR-092).
  const { data: tree } = useResource<ProductCategoryList>(
    '/products/categories',
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [namesAt, setNamesAt] = useState<NameAt | null>(null);
  // The variants' table is named by its heading, as the names' is: two
  // tables on one page, each told apart by what it holds.
  const variantsTitleId = useId();
  // The languages its documents require, every role's to read (ADR-080),
  // which the names' table marks (ADR-092); and the one items are named
  // in, which the table and the dialogs say (ADR-054, amended for #531).
  const { data: organization } =
    useResource<OrganizationEnvelope>('/organization');
  const required = organization?.organization.requiredNameLanguages ?? [];
  const language = organization?.organization.productNameLanguage ?? null;

  // The SKU being edited, and its draft value. One at a time: editing several
  // rows before saving any would need a dirty-state map and a way to discard,
  // which is more machinery than a rare correction deserves.
  const [editing, setEditing] = useState<{ id: string; sku: string } | null>(
    null,
  );
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [startingTracking, setStartingTracking] = useState<Variant | null>(
    null,
  );
  // Each start of tracking, so Where it stands reads its lots afresh.
  const [started, setStarted] = useState(0);

  const showSkeleton = useDelayedFlag(loading);

  const canEdit = can('products.update');
  // Start tracking lots changes the code and moves its stock into a lot:
  // both permissions, as its route asks (ADR-094, R13).
  const canStartTracking = canEdit && can('stock.adjust');

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
          defaultMessage: 'This item doesn’t exist',
        })}
        list={{
          to: '/items',
          label: intl.formatMessage({
            id: 'layout.nav.products',
            defaultMessage: 'Items',
          }),
        }}
        onRetry={() => void reload()}
      />
    );
  }

  // Narrows for everything below. The loading and error branches above cover
  // the only two ways product stays null.
  if (!product) return null;

  // Its doors, the Variants table's and Where it stands' alike: never for
  // equipment, which is counted where it stands.
  const startTracking =
    canStartTracking && product.type !== 'equipment'
      ? setStartingTracking
      : undefined;

  // Its category's path from the top, once the tree is read; Uncategorised
  // with none (ADR-092).
  const place = categoryPlaces(tree?.categories ?? []).find(
    (each) => each.id === product.categoryId,
  );
  const categoryPath = product.categoryId
    ? place && pathName(place.path)
    : intl.formatMessage({
        id: 'products.category.none',
        defaultMessage: 'Uncategorised',
      });

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.products',
              defaultMessage: 'Items',
            }),
            to: '/items',
          },
        ]}
        // The reader's language; the forms edit `name`, the base (ADR-056).
        title={product.displayName}
        headingRef={heading}
        actions={
          <>
            <HistoryButton resourceId={product.id} />
            {canEdit && (
              // Named for what it edits, beside a variant's own Edit and
              // Edit names (#594).
              <Button
                variant="outlined"
                onClick={openDialog(() => setEditingItem(true))}
              >
                {intl.formatMessage({
                  id: 'products.editItem',
                  defaultMessage: 'Edit item',
                })}
              </Button>
            )}
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
          </>
        }
        // What it is and where it is filed, under its name (ADR-092).
        subtitle={[productTypeSingular(product.type, intl), categoryPath]
          .filter(Boolean)
          .join(SEPARATOR)}
      />

      {/* First under the title, since someone who knows the trade looks
          there first (ADR-093, R8); Start tracking lots… under a code's
          places too, where "Lot: —" raises it (ADR-094, T3). */}
      <WhereItStands
        key={started}
        product={product}
        onStartTracking={startTracking}
      />

      {product.description && (
        <Typography variant="body1">{product.description}</Typography>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {/* Keyed on what was saved, so a reload starts it afresh. */}
      <ProductGallery
        key={product.images.map((image) => image.fileId).join()}
        productId={product.id}
        productName={product.displayName}
        images={product.images}
        canEdit={can('products.update')}
      />

      {!product?.isActive && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'products.discontinuedNotice',
            defaultMessage:
              'This item is discontinued. Its variants keep their own status, so reactivating restores each to what it was.',
          })}
        </Alert>
      )}

      {/* What documents print in each language (ADR-054), the item's and
          each named variation's, and what they will refuse (ADR-092). Shown
          when there is something to show, or someone who could add it. */}
      {(canEdit ||
        required.length > 0 ||
        product.translations.length > 0 ||
        product.variants.some(
          (variant) => (variant.translations ?? []).length > 0,
        )) && (
        <ItemNames
          product={product}
          required={required}
          language={language}
          canEdit={canEdit}
          canChoose={can('organizations.update')}
          onEdit={(at) => {
            setNamesAt(at);
            setTranslating(true);
          }}
        />
      )}

      {/* Add variant goes under the title where both do not fit (R14). */}
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography
          id={variantsTitleId}
          variant="h6"
          component="h2"
          sx={{ flexGrow: 1 }}
        >
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
        {/* Reached and scrolled by the keyboard where it is cut, at a
            phone's width: a region named for its heading (WCAG 2.1.1;
            axe's scrollable-region-focusable). */}
        <TableContainer
          tabIndex={0}
          role="region"
          aria-labelledby={variantsTitleId}
        >
          <Table size="small" aria-labelledby={variantsTitleId}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.sku',
                    defaultMessage: 'Code',
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
                  onStartTracking={
                    startTracking && (() => startTracking(variant))
                  }
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
        language={language}
        onClose={() => setAdding(false)}
        onCreated={reload}
      />

      <TranslationsDialog
        open={translating}
        product={product}
        required={required}
        language={language}
        at={namesAt}
        onClose={() => setTranslating(false)}
        onSaved={reload}
      />

      {editingItem && (
        <EditItemDialog
          product={product}
          categories={tree?.categories ?? []}
          language={language}
          onClose={() => setEditingItem(false)}
          onSaved={reload}
        />
      )}

      {startingTracking && (
        <StartTrackingDialog
          key={startingTracking.id}
          productId={id!}
          variantId={startingTracking.id}
          sku={startingTracking.sku}
          unitOfMeasure={startingTracking.unitOfMeasure}
          onClose={() => setStartingTracking(null)}
          onStarted={() => {
            setStarted((count) => count + 1);
            void reload();
          }}
        />
      )}

      <EditVariantDialog
        open={editingVariant !== null}
        productId={id!}
        variant={editingVariant}
        language={language}
        onClose={() => setEditingVariant(null)}
        onSaved={reload}
      />
    </Stack>
  );
}
