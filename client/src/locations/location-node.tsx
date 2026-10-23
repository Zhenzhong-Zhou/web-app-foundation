import { Button, Chip, Stack, Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { Reference } from '../components/reference';
import { StatusChip } from '../components/status-chip';
import { SEPARATOR } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { addressLine } from './address-line';
import { locationTypeLabel } from './location-types';
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
  canCreate,
  canEdit,
  onEdit,
  onAddChild,
  onAddress,
}: {
  location: Location;
  all: Location[];
  depth: number;
  /** Add inside makes a location, so it needs locations.create. */
  canCreate: boolean;
  canEdit: boolean;
  onEdit: (location: Location) => void;
  onAddChild: (location: Location) => void;
  /** A site's address (ADR-071); only a site is offered one. */
  onAddress: (site: Location) => void;
}) {
  const isSite = location.type === 'site';
  const intl = useIntl();
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
        {/* The name's element is the row's child, as the e2e reads it, so the
            address goes inside it on a line of its own rather than in a box
            around it. */}
        <Typography sx={{ flexGrow: 1 }}>
          {location.name}
          {location.code && (
            <Typography component="span" color="text.secondary">
              {SEPARATOR}
              <Reference>{location.code}</Reference>
            </Typography>
          )}
          {/* Where goods are delivered and sent back (ADR-071). */}
          {isSite && location.address && (
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              {addressLine(location.address)}
            </Typography>
          )}
        </Typography>

        <Chip
          label={locationTypeLabel(location.type, intl)}
          size="small"
          variant="outlined"
        />

        {/* Leaf-ness is computed, not declared (ADR-024). Showing it here is
            what makes "stock goes in the places that contain nothing else"
            visible rather than a rule people discover by being refused — and
            the chip disappearing the moment a child is added is that invariant
            rendered. */}
        {!children.length && (
          <StatusChip
            tone="info"
            label={intl.formatMessage({
              id: 'locations.holdsStock',
              defaultMessage: 'Holds stock',
            })}
          />
        )}

        {/* Quarantine, Returns, and WIP are locations rather than a status on
            the stock row, so the distinction has to be visible somewhere. */}
        {!location.isAvailable && (
          <StatusChip
            tone="warning"
            label={intl.formatMessage({
              id: 'locations.notAvailable',
              defaultMessage: 'Not available',
            })}
          />
        )}

        {/* Retired rather than deleted: a location referenced by movement
            history cannot be removed without inventing gaps in the ledger. */}
        {!location.isActive && (
          <Chip
            label={intl.formatMessage({
              id: 'common.retired',
              defaultMessage: 'Retired',
            })}
            size="small"
          />
        )}

        {canCreate && (
          <Button
            variant="text"
            size="small"
            onClick={openDialog(() => onAddChild(location))}
          >
            {intl.formatMessage({
              id: 'locations.addInside',
              defaultMessage: 'Add inside',
            })}
          </Button>
        )}

        {canEdit && (
          <>
            {isSite && (
              <Button
                variant="text"
                size="small"
                onClick={openDialog(() => onAddress(location))}
              >
                {intl.formatMessage({
                  id: 'locations.address',
                  defaultMessage: 'Address',
                })}
              </Button>
            )}
            <Button
              variant="text"
              size="small"
              onClick={openDialog(() => onEdit(location))}
            >
              {intl.formatMessage({
                id: 'common.edit',
                defaultMessage: 'Edit',
              })}
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
          canCreate={canCreate}
          canEdit={canEdit}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onAddress={onAddress}
        />
      ))}
    </>
  );
}
