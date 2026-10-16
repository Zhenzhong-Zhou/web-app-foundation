import { Stack, TextField } from '@mui/material';
import { useIntl } from 'react-intl';

import type { AddressValues } from './address-values';

/**
 * The six parts of an address the organization owns: its registered one
 * (ADR-046) and a site's (ADR-071). The lengths are the server's, from
 * OrganizationAddressDto, which a site's address extends.
 */
export function AddressFields({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  value: AddressValues;
  onChange: (value: AddressValues) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();

  function update(field: keyof AddressValues) {
    return (event: { target: { value: string } }) =>
      onChange({ ...value, [field]: event.target.value });
  }

  return (
    <>
      <TextField
        id={`${idPrefix}-line1`}
        label={intl.formatMessage({
          id: 'settings.org.address.line1',
          defaultMessage: 'Address line 1',
        })}
        required
        fullWidth
        value={value.line1}
        onChange={update('line1')}
        disabled={disabled}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        id={`${idPrefix}-line2`}
        label={intl.formatMessage({
          id: 'partners.address.line2',
          defaultMessage: 'Address line 2',
        })}
        fullWidth
        value={value.line2}
        onChange={update('line2')}
        disabled={disabled}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id={`${idPrefix}-city`}
          label={intl.formatMessage({
            id: 'partners.address.city',
            defaultMessage: 'City',
          })}
          fullWidth
          value={value.city}
          onChange={update('city')}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <TextField
          id={`${idPrefix}-region`}
          label={intl.formatMessage({
            id: 'partners.address.region',
            defaultMessage: 'Province or state',
          })}
          fullWidth
          value={value.region}
          onChange={update('region')}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id={`${idPrefix}-postal-code`}
          label={intl.formatMessage({
            id: 'partners.address.postalCode',
            defaultMessage: 'Postal code',
          })}
          fullWidth
          value={value.postalCode}
          onChange={update('postalCode')}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: 32 } }}
        />
        <TextField
          id={`${idPrefix}-country`}
          label={intl.formatMessage({
            id: 'partners.address.country',
            defaultMessage: 'Country',
          })}
          required
          fullWidth
          value={value.country}
          onChange={update('country')}
          disabled={disabled}
          helperText={intl.formatMessage({
            id: 'settings.org.country.help',
            defaultMessage: 'Two letters: CA, US.',
          })}
          slotProps={{ htmlInput: { maxLength: 2 } }}
        />
      </Stack>
    </>
  );
}
