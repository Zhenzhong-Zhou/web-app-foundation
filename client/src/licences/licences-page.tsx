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
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { HistoryButton } from '../audit/history-button';
import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { ProductLicence } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { EditLicenceDialog } from './edit-licence-dialog';
import { NewLicenceDialog } from './new-licence-dialog';

/**
 * The registrations formulations are made and sold under — an NPN, a DIN, a
 * cosmetic notification number.
 *
 * Reference data, set up once and then chosen on a recipe, so it is reached
 * from Products rather than the top nav: a screen visited twice a year does
 * not earn a permanent tab.
 */
function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function LicencesPage() {
  const { session } = useAuth();
  const [licences, setLicences] = useState<ProductLicence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProductLicence | null>(null);

  const loading = licences === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const canCreate = !!session?.permissions.includes('product_licences.create');
  const canUpdate = !!session?.permissions.includes('product_licences.update');

  /**
   * Reloading after a dialog saves. The first load runs in the effect below
   * rather than through this, because a state setter called straight from an
   * effect body is the pattern the hooks lint rule refuses — and the other
   * list pages fetch the same way.
   */
  const load = useCallback(async () => {
    try {
      setLicences(await api<ProductLicence[]>('/product-licences'));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<ProductLicence[]>('/product-licences')
      .then((rows) => {
        if (!ignore) setLicences(rows);
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
          Licences
        </Typography>

        {canCreate && (
          <Button onClick={openDialog(() => setCreating(true))}>
            Add licence
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Recipes are made under these. A licence that is withdrawn or expired is
        deactivated rather than deleted, so a batch made under it still traces
        back.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : licences?.length === 0 ? (
          <Alert severity="info">
            No licences yet. Add the number a formulation is registered under —
            for a natural health product in Canada, its NPN.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Number</TableCell>
                  <TableCell>Issued by</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right" aria-label="Actions" />
                </TableRow>
              </TableHead>

              <TableBody>
                {licences?.map((licence) => (
                  <TableRow key={licence.id}>
                    <TableCell>{licence.number}</TableCell>
                    <TableCell>{licence.authority}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={licence.isActive ? 'Current' : 'Withdrawn'}
                        color={licence.isActive ? 'success' : 'default'}
                        variant={licence.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>{licence.notes ?? '—'}</TableCell>
                    <TableCell align="right">
                      {/* A correction is the change people come looking for:
                          "who changed the number, and when". */}
                      <HistoryButton resourceId={licence.id} />

                      {canUpdate && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => setEditing(licence))}
                        >
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <NewLicenceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
      />

      {/* Keyed on the row, so opening a second licence starts from its own
          values rather than the previous one's (ADR: MUI Dialog state). */}
      <EditLicenceDialog
        key={editing?.id}
        licence={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
