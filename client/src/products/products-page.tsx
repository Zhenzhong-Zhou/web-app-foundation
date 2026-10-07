import {
  Alert,
  Button,
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
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
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
  const [search, setSearch] = useState('');
  const [discontinuedOnly, setDiscontinuedOnly] = useState(false);

  const showSkeleton = useDelayedFlag(loading);

  /**
   * Narrowed here: the catalogue arrives whole (GET /products is not
   * paged), so a search over names needs no request. Discontinued ones
   * stay listed by default, as before; the quick filter shows only them.
   */
  const discontinued = (items ?? []).filter((item) => !item.isActive).length;
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (items ?? []).filter(
      (item) =>
        (!discontinuedOnly || !item.isActive) &&
        (!needle || item.name.toLocaleLowerCase().includes(needle)),
    );
  }, [items, search, discontinuedOnly]);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.products',
          defaultMessage: 'Products',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            {/* Reference data for recipes, so it hangs off the catalogue
                rather than the navigation. */}
            {can('product_licences.view') && (
              <Button variant="text" component={RouterLink} to="/licences">
                {intl.formatMessage({
                  id: 'products.licences',
                  defaultMessage: 'Licences',
                })}
              </Button>
            )}
            <Button
              variant="text"
              disabled={loading}
              onClick={() => void reload()}
            >
              {intl.formatMessage({
                id: 'common.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>
            {/* Hidden without products.create — display only, since the
                403 is the actual control (ADR-016). */}
            {can('products.create') && (
              <Button onClick={openDialog(() => setCreating(true))}>
                {intl.formatMessage({
                  id: 'products.add',
                  defaultMessage: 'Add product',
                })}
              </Button>
            )}
          </Stack>
        }
      />

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: search,
          onChange: setSearch,
        }}
        quick={[
          {
            id: 'discontinued',
            label: intl.formatMessage({
              id: 'products.discontinued',
              defaultMessage: 'Discontinued',
            }),
            count: discontinued,
            pressed: discontinuedOnly,
            onToggle: () => setDiscontinuedOnly((on) => !on),
          },
        ]}
      />

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
        ) : shown.length ? (
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
                {shown.map((item) => (
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
                        <StatusChip
                          tone="neutral"
                          label={intl.formatMessage({
                            id: 'products.discontinued',
                            defaultMessage: 'Discontinued',
                          })}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          // The header offers Add product; the empty state only says why
          // the list is empty.
          <EmptyState>
            {items?.length
              ? intl.formatMessage({
                  id: 'inventory.noMatch',
                  defaultMessage: 'Nothing matches that search.',
                })
              : intl.formatMessage({
                  id: 'products.empty',
                  defaultMessage: 'No products yet.',
                })}
          </EmptyState>
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
