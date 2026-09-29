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
import { useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { formatUnitCost } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { PriceListDetail, PriceListItem } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { EditPriceListDialog } from './edit-price-list-dialog';
import { SetPriceDialog } from './set-price-dialog';

const SIDE = {
  sale: 'What customers pay',
  purchase: 'What a supplier charges',
} as const;

/** One list and the price of every item on it (ADR-049). */
export function PriceListDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const { data, error, setError, loading, reload } = useResource<{
    priceList: PriceListDetail;
  }>(`/price-lists/${id}`);
  const list = data?.priceList ?? null;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [correcting, setCorrecting] = useState<PriceListItem | null>(null);
  const [working, setWorking] = useState(false);

  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('price_lists.update');

  async function remove(item: PriceListItem) {
    setWorking(true);
    setError(null);

    try {
      await api(`/price-lists/${id}/items/${item.variantId}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setWorking(false);
    }
  }

  if (!list) {
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : showSkeleton ? (
      <Skeleton height={240} />
    ) : null;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: 'Price lists', to: '/settings/price-lists' }]}
        title={list.name}
        status={
          list.isActive ? undefined : { label: 'Retired', color: 'default' }
        }
        subtitle={`${SIDE[list.direction]} · ${list.currency}`}
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryButton resourceId={list.id} />
            {canUpdate && (
              <Button
                variant="text"
                onClick={openDialog(() => setEditing(true))}
              >
                Edit
              </Button>
            )}
            {canUpdate && (
              <Button onClick={openDialog(() => setAdding(true))}>
                Add a price
              </Button>
            )}
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {list.items.length === 0 ? (
          <Alert severity="info">No prices on this list yet.</Alert>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Prices">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Unit price</TableCell>
                  <TableCell align="right" aria-label="Actions" />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.items.map((item) => (
                  <TableRow key={item.variantId}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell align="right">
                      {formatUnitCost(item.unitPrice, list.currency)}
                    </TableCell>
                    <TableCell align="right">
                      {canUpdate && (
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ justifyContent: 'flex-end' }}
                        >
                          <Button
                            variant="text"
                            size="small"
                            disabled={working}
                            onClick={openDialog(() => setCorrecting(item))}
                          >
                            Change
                          </Button>
                          <Button
                            variant="text"
                            size="small"
                            color="error"
                            disabled={working}
                            onClick={() => void remove(item)}
                          >
                            Remove
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Typography variant="body2" color="text.secondary">
        Prices are per unit, before tax. A change here prices lines added from
        now on; orders already written keep what they were given.
      </Typography>

      <EditPriceListDialog
        key={editing ? list.id : 'closed'}
        list={editing ? list : null}
        onClose={() => setEditing(false)}
        onSaved={reload}
      />

      <SetPriceDialog
        key={correcting?.variantId ?? (adding ? 'new' : 'closed')}
        open={adding || correcting !== null}
        priceListId={list.id}
        currency={list.currency}
        item={
          correcting && {
            variantId: correcting.variantId,
            sku: correcting.sku,
            unitPrice: correcting.unitPrice,
          }
        }
        excludeVariantIds={list.items.map((item) => item.variantId)}
        onClose={() => {
          setAdding(false);
          setCorrecting(null);
        }}
        onSaved={reload}
      />
    </Stack>
  );
}
