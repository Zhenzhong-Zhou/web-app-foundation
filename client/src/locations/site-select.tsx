import { Box, MenuItem, TextField } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import type { ChosenSite, Location } from '../api/types.gen';
import { addressLine } from './address-line';

/**
 * One of the organization's sites, chosen for a document (ADR-071,
 * amended): a purchase order's Deliver to, an RMA's Send back to.
 *
 * Active sites are offered, and the one already chosen even once it is
 * retired, so the field still says where the document points. The chosen
 * site's address shows beneath it, or that it has none yet and the document
 * prints the registered address, which is the moment to fix it in
 * Locations. The empty choice is the caller's to name: none, or a default
 * the server works out.
 *
 * `unreadable` for a reader whose roles do not include seeing locations
 * (ADR-080), whose page never asks for them: the field keeps what is
 * chosen, cannot be changed, and says why, with what the empty choice
 * means when it is the one standing.
 */
export function SiteSelect({
  id,
  label,
  value,
  onChange,
  locations,
  current = null,
  emptyLabel,
  emptyHelp,
  unreadable = false,
}: {
  id: string;
  label: string;
  /** The chosen site's id, or '' for the empty choice. */
  value: string;
  onChange: (siteId: string) => void;
  /** Every location the page has; only sites are offered. */
  locations: Location[];
  current?: ChosenSite | null;
  emptyLabel: string;
  /** What the empty choice means, said beneath the field. */
  emptyHelp: string;
  unreadable?: boolean;
}) {
  const intl = useIntl();

  const sites = locations.filter(
    (location) =>
      location.type === 'site' &&
      (location.isActive || location.id === current?.id),
  );
  const offered: ChosenSite[] =
    current && !sites.some((site) => site.id === current.id)
      ? [...sites, current]
      : sites;

  const chosen = locations.find((location) => location.id === value);

  function help(): ReactNode {
    if (unreadable) {
      return (
        <>
          {intl.formatMessage({
            id: 'locations.site.unreadable',
            defaultMessage:
              'You can’t see the organization’s locations, so you can’t choose one here.',
          })}
          {!value && (
            <Box component="span" sx={{ display: 'block' }}>
              {emptyHelp}
            </Box>
          )}
        </>
      );
    }
    if (!value) return emptyHelp;
    // Not among the sites yet: still loading, or they could not be read.
    // Saying it has no address would be a guess.
    if (!chosen) return undefined;
    if (chosen.address) return addressLine(chosen.address);
    return intl.formatMessage({
      id: 'locations.site.noAddress',
      defaultMessage:
        'No address yet, so the document prints the registered address. Add one in Locations.',
    });
  }

  return (
    <TextField
      id={id}
      label={label}
      select
      fullWidth
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={unreadable}
      helperText={help()}
      slotProps={{
        select: { displayEmpty: true },
        inputLabel: { shrink: true },
      }}
    >
      <MenuItem value="">{emptyLabel}</MenuItem>
      {offered.map((site) => (
        <MenuItem key={site.id} value={site.id}>
          {site.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
