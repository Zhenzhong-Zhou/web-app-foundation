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
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { api, messageFor } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { PriceList } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreatePriceListDialog } from './create-price-list-dialog';

const SIDE = { sale: 'Sale', purchase: 'Purchase' } as const;

/**
 * Every price list (ADR-049). A list proposes the price a line takes when it
 * is added without one; the line keeps its own copy, so nothing here changes
 * an order already written.
 */
export function PriceListsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [lists, setLists] = useState<PriceList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const showSkeleton = useDelayedFlag(lists === null && error === null);

  useEffect(() => {
    let ignore = false;

    void api<{ priceLists: PriceList[] }>('/price-lists')
      .then((response) => {
        if (!ignore) setLists(response.priceLists);
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(messageFor(caught));
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Price lists
        </Typography>
        {can('price_lists.create') && (
          <Button onClick={openDialog(() => setCreating(true))}>
            New price list
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        A line added without a price takes one from its customer’s or supplier’s
        list, and keeps it. Changing a list never changes an order already
        written.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {lists === null ? (
          showSkeleton ? (
            <Skeleton height={120} sx={{ m: 2 }} />
          ) : null
        ) : lists.length === 0 ? (
          <Alert severity="info">No price lists yet.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell aria-label="Status" />
                </TableRow>
              </TableHead>
              <TableBody>
                {lists.map((list) => (
                  <TableRow key={list.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/settings/price-lists/${list.id}`}
                      >
                        {list.name}
                      </Link>
                    </TableCell>
                    <TableCell>{SIDE[list.direction]}</TableCell>
                    <TableCell>{list.currency}</TableCell>
                    <TableCell align="right">{list.itemCount}</TableCell>
                    <TableCell>
                      {!list.isActive && <Chip size="small" label="Retired" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <CreatePriceListDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/settings/price-lists/${id}`)}
      />
    </Stack>
  );
}
