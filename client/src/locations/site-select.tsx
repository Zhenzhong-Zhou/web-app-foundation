import { MenuItem, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { addressLine } from './address-line';

/** A site a document already names, as the order and the RMA return it. */
interface ChosenSite {
  id: string;
  name: string;
}

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

  function help(): string {
    if (!value) return emptyHelp;
    if (chosen?.address) return addressLine(chosen.address);
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
