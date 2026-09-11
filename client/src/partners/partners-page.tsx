import {
  Alert,
  Button,
  Chip,
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

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import type { Partner } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreatePartnerDialog } from './create-partner-dialog';
import { EditPartnerDialog } from './edit-partner-dialog';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * The directory of everyone the organization trades with (ADR-026).
 *
 * One list, no customer/supplier split: the same firm is often both, and what
 * a partner *is* follows from what has been traded with them — a join over
 * orders, which belongs to that screen rather than this one.
 *
 * Retired partners are listed here rather than hidden. This is a directory,
 * and a name that vanished is harder to explain than one shown as inactive.
 * The order form is where the filter belongs, because that is the one place an
 * inactive partner would be a mistake.
 */
export function PartnersPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<Partner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);

  const canCreate = !!session?.permissions.includes('partners.create');
  const canEdit = !!session?.permissions.includes('partners.update');
  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setItems(await api<Partner[]>('/partners'));
    setError(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<Partner[]>('/partners')
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
          Partners
        </Typography>

        <Button variant="text" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>

        {/* Hidden without partners.create — display only, since the 403 is the
            actual control (ADR-016). */}
        {canCreate && (
          <Button onClick={() => setCreating(true)}>Add partner</Button>
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
                <TableCell>Code</TableCell>
                <TableCell>Tax ID</TableCell>
                <TableCell>Status</TableCell>
                {/* The column exists only when it can hold anything. An empty
                    actions column is a promise the screen cannot keep. */}
                {canEdit && <TableCell align="right">Edit</TableCell>}
              </TableRow>
            </TableHead>

            <TableBody>
              {items.map((partner) => (
                <TableRow key={partner.id} hover>
                  <TableCell>{partner.name}</TableCell>

                  {/* An em dash rather than an empty cell: blank reads as a
                      rendering fault, and every one of these is optional. */}
                  <TableCell>{partner.code ?? '—'}</TableCell>
                  <TableCell>{partner.taxId ?? '—'}</TableCell>

                  <TableCell>
                    {partner.isActive ? (
                      'Active'
                    ) : (
                      // Retired rather than deleted: a partner referenced by
                      // an order cannot be removed without inventing gaps in
                      // the history the order exists to record.
                      <Chip label="Retired" size="small" />
                    )}
                  </TableCell>

                  {canEdit && (
                    <TableCell align="right">
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setEditing(partner)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            No partners yet. Add the firms you buy from and sell to — an order
            needs one before it can be raised. The same partner can be both.
          </Typography>
        )}
      </Paper>

      <CreatePartnerDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
      />

      {/**
       * Keyed here rather than on the Dialog inside: a key remounts the
       * component it is written on, and the state lives in this one. On the
       * inner Dialog it rebuilt MUI's element while useState kept its first
       * value — seeded from a null partner, so the form opened empty.
       */}
      <EditPartnerDialog
        key={editing?.id}
        partner={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
