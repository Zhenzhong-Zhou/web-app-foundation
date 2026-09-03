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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreateProductDialog } from './create-product-dialog';

export interface Variant {
  id: string;
  sku: string;
  name: string | null;
  isActive: boolean;
  tracksBatches: boolean;
}

export interface Product {
  id: string;
  type: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function ProductsPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setItems(await api<Product[]>('/products'));
    setError(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<Product[]>('/products')
      .then((rows) => {
        if (!ignore) setItems(rows);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Products
        </Typography>

        <Button variant="text" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>

        {/* Hidden without products.create — display only, since the 403 is the
            actual control (ADR-016). */}
        {session?.permissions.includes('products.create') && (
          <Button onClick={() => setCreating(true)}>Add product</Button>
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
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
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
                  <TableCell>{item.type}</TableCell>
                  <TableCell>
                    {item.isActive ? (
                      'Active'
                    ) : (
                      // Discontinued rather than deleted: a product whose
                      // variants have movement history cannot be removed
                      // (ADR-023).
                      <Chip label="Discontinued" size="small" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            No products yet.
          </Typography>
        )}
      </Paper>

      <CreateProductDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
      />
    </Stack>
  );
}
