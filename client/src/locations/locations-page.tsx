import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { CreateLocationDialog } from './create-location-dialog';
import { EditLocationDialog } from './edit-location-dialog';

export interface Location {
  id: string;
  type: string;
  name: string;
  code: string | null;
  parentId: string | null;
  isAvailable: boolean;
  isActive: boolean;
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * The server returns the tree flat, ordered by name, and the client nests it —
 * a recursive CTE is not worth it at tens of rows, and the flat list is what
 * the parent picker needs anyway (ADR-024).
 *
 * Orphans are included at the top rather than dropped. A location whose parent
 * is missing should be visible and fixable, not invisible; silently hiding
 * rows is how a tree loses data nobody can find again.
 */
function childrenOf(all: Location[], parentId: string | null): Location[] {
  const ids = new Set(all.map((location) => location.id));

  return all.filter((location) =>
    parentId === null
      ? location.parentId === null || !ids.has(location.parentId)
      : location.parentId === parentId,
  );
}

function LocationNode({
  location,
  all,
  depth,
  canEdit,
  onEdit,
  onAddChild,
}: {
  location: Location;
  all: Location[];
  depth: number;
  canEdit: boolean;
  onEdit: (location: Location) => void;
  onAddChild: (location: Location) => void;
}) {
  const children = childrenOf(all, location.id);

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          py: 1,
          pl: 2 + depth * 3,
          pr: 2,
          borderTop: depth === 0 ? undefined : '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography sx={{ flexGrow: 1 }}>
          {location.name}
          {location.code && (
            <Typography component="span" color="text.secondary">
              {' '}
              · {location.code}
            </Typography>
          )}
        </Typography>

        <Chip label={location.type} size="small" variant="outlined" />

        {/* Leaf-ness is computed, not declared (ADR-024). Showing it here is
            what makes "stock goes in the places that contain nothing else"
            visible rather than a rule people discover by being refused. */}
        {!children.length && (
          <Chip label="Holds stock" size="small" color="primary" />
        )}

        {/* Quarantine, Returns, and WIP are locations rather than a status on
            the stock row, so the distinction has to be visible somewhere. */}
        {!location.isAvailable && (
          <Chip label="Not available" size="small" color="warning" />
        )}

        {!location.isActive && <Chip label="Retired" size="small" />}

        {canEdit && (
          <>
            <Button
              variant="text"
              size="small"
              onClick={() => onAddChild(location)}
            >
              Add inside
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => onEdit(location)}
            >
              Edit
            </Button>
          </>
        )}
      </Stack>

      {children.map((child) => (
        <LocationNode
          key={child.id}
          location={child}
          all={all}
          depth={depth + 1}
          canEdit={canEdit}
          onEdit={onEdit}
          onAddChild={onAddChild}
        />
      ))}
    </>
  );
}

/**
 * Where the warehouse layout is set up. Unremarkable on its own, and the thing
 * that makes the inventory screen usable: stock has to go somewhere, and until
 * this existed the only way to create that somewhere was curl.
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
            No locations yet. Start with a warehouse — you can add zones,
            aisles, and bins inside it later, or leave it as one room.
          </Typography>
        )}
      </Paper>

      <CreateLocationDialog
        open={creating}
        parent={creatingUnder}
        onClose={() => setCreating(false)}
        onCreated={load}
      />

      <EditLocationDialog
        location={editing}
        locations={items ?? []}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
