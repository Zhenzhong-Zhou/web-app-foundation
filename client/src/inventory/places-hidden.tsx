import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * Where places would show, for a reader without locations.view, once a
 * page (review 3, 115): why there are none, in the role editor's own
 * words for the permission, and who can change it. Movements, a lot's
 * Where it is now, the item's Where it stands and a code's places on
 * Stock say it; the server sends such a reader no place (96a).
 */
export function PlacesHidden() {
  const intl = useIntl();

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {intl.formatMessage({
        id: 'inventory.placesHidden',
        defaultMessage:
          'Warehouses, zones and bins are hidden: your role can’t see them. An Owner or Admin can change that.',
      })}
    </Typography>
  );
}
