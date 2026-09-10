import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import type { Location } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreateLocationDialog } from './create-location-dialog';
import { EditLocationDialog } from './edit-location-dialog';
import { LocationNode } from './location-node';
import { childrenOf } from './tree';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * Where the layout is set up. Unremarkable on its own, and the thing that
 * makes the inventory screen usable: stock has to go somewhere, and until this
 * existed the only way to create that somewhere was curl.
 *
 * Loading and dialog state only — the tree itself is LocationNode's, which is
 * recursive and has nothing to do with either.
 */
export function LocationsPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<Location[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const canEdit = !!session?.permissions.includes('locations.update');
  const canCreate = !!session?.permissions.includes('locations.create');
  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setItems(await api<Location[]>('/locations'));
    setError(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<Location[]>('/locations')
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

  const roots = items ? childrenOf(items, null) : [];

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Locations
        </Typography>

        <Button variant="text" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>

        {/* Hidden without locations.create — display only, since the 403 is
            the actual control (ADR-016). */}
        {canCreate && (
          <Button
            onClick={() => {
              setCreatingUnder(null);
              setCreating(true);
            }}
          >
            Add location
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={40} />
                <Skeleton height={40} />
              </>
            ) : null}
          </Stack>
        ) : roots.length ? (
          <Box>
            {roots.map((location) => (
              <LocationNode
                key={location.id}
                location={location}
                all={items ?? []}
                depth={0}
                canEdit={canEdit}
                onEdit={setEditing}
                onAddChild={(parent) => {
                  setCreatingUnder(parent);
                  setCreating(true);
                }}
              />
            ))}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            No locations yet. Start with a site — a building or an address. You
            can add zones, aisles, and bins inside it later, or leave it as one
            room.
          </Typography>
        )}
      </Paper>

      <CreateLocationDialog
        open={creating}
        parent={creatingUnder}
        onClose={() => setCreating(false)}
        onCreated={load}
      />

      {/**
       * Keyed here rather than on the Dialog inside: a key remounts the
       * component it is written on, and the state lives in this one. On the
       * inner Dialog it rebuilt MUI's element while useState kept its first
       * value — seeded from a null location, so the form opened empty.
       */}
      <EditLocationDialog
        key={editing?.id}
        location={editing}
        locations={items ?? []}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
