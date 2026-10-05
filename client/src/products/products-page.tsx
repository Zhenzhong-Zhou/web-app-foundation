import {
  Alert,
  Button,
  Chip,
  Link,
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
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import type { Locale } from '../lib/locales';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { CreateProductDialog } from './create-product-dialog';
import { productTypeLabel } from './product-types';

/** A variant's name in one language (ADR-054). On the detail read only. */
export interface VariantTranslation {
  locale: Locale;
  name: string;
}

export interface Variant {
  id: string;
  sku: string;
  name: string | null;
  unitOfMeasure: string;
  isActive: boolean;
  tracksLots: boolean;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  caseQuantity: number | null;
  translations?: VariantTranslation[];
}

export interface Product {
  id: string;
  type: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export function ProductsPage() {
  const intl = useIntl();
  const can = useCan();

  const {
    data: items,
    error,
    loading,
    reload,
  } = useResource<Product[]>('/products');
  const [creating, setCreating] = useState(false);

  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'layout.nav.products',
            defaultMessage: 'Products',
          })}
        </Typography>

        {/* Reference data for recipes, so it hangs off the catalogue rather
            than the top nav, which is already seven items wide. */}
        {can('product_licences.view') && (
          <Button variant="text" component={RouterLink} to="/licences">
            {intl.formatMessage({
              id: 'products.licences',
              defaultMessage: 'Licences',
            })}
          </Button>
        )}

        <Button variant="text" disabled={loading} onClick={() => void reload()}>
          {intl.formatMessage({
            id: 'common.refresh',
            defaultMessage: 'Refresh',
          })}
        </Button>

        {/* Hidden without products.create — display only, since the 403 is the
            actual control (ADR-016). */}
        {can('products.create') && (
          <Button onClick={openDialog(() => setCreating(true))}>
            {intl.formatMessage({
              id: 'products.add',
              defaultMessage: 'Add product',
            })}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : items?.length ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.name',
                      defaultMessage: 'Name',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'products.typeLabel',
                      defaultMessage: 'Type',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      {/* The detail page is where variants live. The list shows
                        products because that is the grouping a person scans;
                        the variant is what they act on once they are there. */}
                      <Link component={RouterLink} to={`/products/${item.id}`}>
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{productTypeLabel(item.type, intl)}</TableCell>
                    <TableCell>
                      {item.isActive ? (
                        intl.formatMessage({
                          id: 'common.active',
                          defaultMessage: 'Active',
                        })
                      ) : (
                        // Discontinued rather than deleted: a product whose
                        // variants have movement history cannot be removed
                        // (ADR-023).
                        <Chip
                          label={intl.formatMessage({
                            id: 'products.discontinued',
                            defaultMessage: 'Discontinued',
                          })}
                          size="small"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {intl.formatMessage({
              id: 'products.empty',
              defaultMessage: 'No products yet.',
            })}
          </Typography>
        )}
      </Paper>

      <CreateProductDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
      />
    </Stack>
  );
}
