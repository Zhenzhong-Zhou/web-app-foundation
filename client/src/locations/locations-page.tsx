import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { openDialog } from '../lib/open-dialog';
import type { Location } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { CreateLocationDialog } from './create-location-dialog';
import { EditLocationDialog } from './edit-location-dialog';
import { LocationNode } from './location-node';
import { childrenOf } from './tree';

/**
 * Where the layout is set up. Unremarkable on its own, and the thing that
 * makes the inventory screen usable: stock has to go somewhere, and until this
 * existed the only way to create that somewhere was curl.
 *
 * Loading and dialog state only — the tree itself is LocationNode's, which is
 * recursive and has nothing to do with either.
 */
export function LocationsPage() {
  const can = useCan();

  const {
    data: items,
    error,
    loading,
    reload,
  } = useResource<Location[]>('/locations');
  const [creatingUnder, setCreatingUnder] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const canEdit = can('locations.update');
  const canCreate = can('locations.create');
  const showSkeleton = useDelayedFlag(loading);

  const roots = items ? childrenOf(items, null) : [];

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title="Locations"
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="text"
              disabled={loading}
              onClick={() => void reload()}
            >
              Refresh
            </Button>
            {canCreate && (
              <Button onClick={openDialog(() => setCreating(true))}>
                Add location
              </Button>
            )}
          </Stack>
        }
      />

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
        onCreated={reload}
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
        onSaved={reload}
      />
    </Stack>
  );
}
