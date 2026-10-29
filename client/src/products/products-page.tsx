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

import type { ProductSummary } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { PageHeader } from '../components/page-header';
import { ProductCover } from '../components/product-cover';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { useResource } from '../lib/use-resource';
import { CreateProductDialog } from './create-product-dialog';
import { productTypeLabel } from './product-types';

/**
 * Products and their variants, generated from the server's OpenAPI document
 * (ADR-068), re-exported here for the files that import them from this page.
 */
export type { Variant, VariantTranslation } from '../api/types.gen';

export function ProductsPage() {
  const intl = useIntl();
  const can = useCan();

  /**
   * Searched on the server (ADR-056, amended), as the lookup finds an
   * item: by any variant's SKU, its and its variants' names in every
   * language, and their pinyin, best match first. From the address too:
   * the lookup's "Show all" opens it narrowed.
   */
  const { text, setText, search } = useListSearch();
  const {
    data: items,
    error,
    refused,
    loading,
    reload,
  } = useResource<ProductSummary[]>(withSearch('/products', search));
  const [creating, setCreating] = useState(false);
  const [discontinuedOnly, setDiscontinuedOnly] = useState(false);

  const showSkeleton = useDelayedFlag(loading);

  /**
   * The answer is whole, searched or not (GET /products is not paged), so
   * Discontinued narrows it here and counts within it. Discontinued ones
   * stay listed by default; the quick filter shows only them.
   */
  const discontinued = (items ?? []).filter((item) => !item.isActive).length;
  const shown = useMemo(
    () => (items ?? []).filter((item) => !discontinuedOnly || !item.isActive),
    [items, discontinuedOnly],
  );

  if (refused) {
    return (
      <RevisionRefusalPage failure={refused} onRetry={() => void reload()} />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.products',
          defaultMessage: 'Products',
        })}
        actions={
          <>
            {/* What the list shows, its search and Discontinued, every
                language's names (ADR-057). */}
            <ExportButton
              path={withSearch(
                discontinuedOnly
                  ? '/products/export?discontinued=true'
                  : '/products/export',
                search,
              )}
            />
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
          </>
        }
      />

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: text,
          onChange: setText,
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
                      <Stack
                        direction="row"
                        spacing={1.5}
                        sx={{ alignItems: 'center' }}
                      >
                        <ProductCover
                          fileId={item.coverFileId}
                          name={item.name}
                        />
                        <Link
                          component={RouterLink}
                          to={`/products/${item.id}`}
                        >
                          {item.name}
                        </Link>
                      </Stack>
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
          <EmptyState learnMore={{ guide: 'products', section: 'add' }}>
            {search || items?.length
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
