import { ListSubheader, MenuItem } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { SelectField } from '../components/select-field';
import { nameAndCode } from '../lib/format';
import { rem } from '../theme/rem';
import { byWarehouse } from './stock-places';

/**
 * Stock's and Movements' Location filter (review 28): only places stock
 * can sit in, grouped by their warehouse (20a), Everywhere for none. Its
 * page hides it from a reader without locations.view (ADR-080).
 */
export function PlaceFilter({
  id,
  locations,
  leaves,
  value,
  onChange,
}: {
  id: string;
  /** The whole tree, for each place's warehouse. */
  locations: Location[];
  /** The places stock can sit in, which it offers. */
  leaves: Location[];
  value: string;
  onChange: (locationId: string) => void;
}) {
  const intl = useIntl();

  return (
    <SelectField
      id={id}
      size="small"
      label={intl.formatMessage({
        id: 'inventory.location',
        defaultMessage: 'Location',
      })}
      emptyLabel={intl.formatMessage({
        id: 'inventory.everywhere',
        defaultMessage: 'Everywhere',
      })}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: rem(200) }}
    >
      {byWarehouse(locations, leaves).flatMap(([top, inIt]) => [
        <ListSubheader key={`top-${top.id}`}>{top.name}</ListSubheader>,
        ...inIt.map((location) => (
          <MenuItem key={location.id} value={location.id} sx={{ pl: 4 }}>
            {nameAndCode(location.name, location.code)}
          </MenuItem>
        )),
      ])}
    </SelectField>
  );
}
