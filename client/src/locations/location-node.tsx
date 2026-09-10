import { Button, Chip, Stack, Typography } from '@mui/material';

import type { Location } from '../lib/types';
import { childrenOf } from './tree';

/**
 * One row and everything beneath it.
 *
 * Recursive rather than a flattened list with an indent level: the tree is the
 * data, and flattening it here would mean computing depth twice — once to
 * order the rows and again to indent them.
 *
 * Takes the whole list rather than its own children, because leaf-ness is a
 * question about the list and cannot be answered from a row alone.
 */
export function LocationNode({
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
            visible rather than a rule people discover by being refused — and
            the chip disappearing the moment a child is added is that invariant
            rendered. */}
        {!children.length && (
          <Chip label="Holds stock" size="small" color="primary" />
        )}

        {/* Quarantine, Returns, and WIP are locations rather than a status on
            the stock row, so the distinction has to be visible somewhere. */}
        {!location.isAvailable && (
          <Chip label="Not available" size="small" color="warning" />
        )}

        {/* Retired rather than deleted: a location referenced by movement
            history cannot be removed without inventing gaps in the ledger. */}
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
