import {
  Alert,
  Button,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { AddVariantDialog } from './add-variant-dialog';
import type { Product, Variant } from './products-page';

interface ProductDetail extends Product {
  variants: Variant[];
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // The SKU being edited, and its draft value. One at a time: editing several
  // rows before saving any would need a dirty-state map and a way to discard,
  // which is more machinery than a rare correction deserves.
  const [editing, setEditing] = useState<{ id: string; sku: string } | null>(
    null,
  );

  const loading = product === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setProduct(await api<ProductDetail>(`/products/${id!}`));
    setError(null);
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void api<ProductDetail>(`/products/${id!}`)
      .then((row) => {
        if (!ignore) setProduct(row);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  const canEdit = session?.permissions.includes('products.update') ?? false;

  async function patchProduct(body: Record<string, unknown>) {
    setSaving('product');
    setError(null);

    try {
      await api(`/products/${id!}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
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
      await load();
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
      <Stack spacing={2}>
        <Alert severity="error">{error}</Alert>
        <Link component={RouterLink} to="/products">
          Back to products
        </Link>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Link component={RouterLink} to="/products" variant="body2">
        ← Products
      </Link>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {product?.name}
        </Typography>

        <Chip label={product?.type} size="small" />

        {canEdit && (
          // Discontinuing, not deleting. The product's flag is never cascaded
          // to its variants: reactivating could not then know which had been
          // individually discontinued first (ADR-023).
          <Button
            variant="text"
            disabled={saving !== null}
            onClick={() => void patchProduct({ isActive: !product?.isActive })}
          >
            {product?.isActive ? 'Discontinue' : 'Reactivate'}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!product?.isActive && (
        <Alert severity="info">
          This product is discontinued. Its variants keep their own status, so
          reactivating restores each to what it was.
        </Alert>
      )}

      {product?.description && (
        <Typography color="text.secondary">{product.description}</Typography>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Variants
        </Typography>

        {canEdit && (
          <Button onClick={() => setAdding(true)}>Add variant</Button>
        )}
      </Stack>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Lots</TableCell>
              <TableCell>Active</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {product?.variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell>
                  {editing?.id === variant.id ? (
                    <TextField
                      size="small"
                      value={editing.sku}
                      autoFocus
                      onChange={(event) =>
                        setEditing({ id: variant.id, sku: event.target.value })
                      }
                      onBlur={() => {
                        if (editing.sku !== variant.sku) {
                          void patchVariant(variant.id, { sku: editing.sku });
                        } else {
                          setEditing(null);
                        }
                      }}
                    />
                  ) : (
                    // Editable: a typo found after the first receipt should be
                    // fixable, and locking it just pushes people into creating
                    // a duplicate product (ADR-023). The rename is audited.
                    <Link
                      component="button"
                      type="button"
                      disabled={!canEdit || saving !== null}
                      onClick={() =>
                        setEditing({ id: variant.id, sku: variant.sku })
                      }
                    >
                      {variant.sku}
                    </Link>
                  )}
                </TableCell>

                <TableCell>{variant.name ?? '—'}</TableCell>

                <TableCell>
                  {/* Read-only, deliberately. Set once at creation, because
                      flipping it on a variant with stock leaves every row
                      violating the invariant in one direction or the other. */}
                  {variant.tracksBatches ? 'Tracked' : '—'}
                </TableCell>

                <TableCell>
                  <Switch
                    size="small"
                    checked={variant.isActive}
                    disabled={!canEdit || saving !== null}
                    onChange={() =>
                      void patchVariant(variant.id, {
                        isActive: !variant.isActive,
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <AddVariantDialog
        open={adding}
        productId={id!}
        onClose={() => setAdding(false)}
        onCreated={load}
      />
    </Stack>
  );
}
