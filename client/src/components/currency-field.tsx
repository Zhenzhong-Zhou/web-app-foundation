import { TextField, type TextFieldProps } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * A three-letter ISO 4217 code, uppercased as it is typed.
 *
 * Uppercased on the way in rather than validated on the way out: the server
 * takes the code in capitals, and "cad" is a typo nobody means. Capped at
 * three because no code is longer. The server's check stays the guarantee;
 * this is what keeps a lowercase code from ever reaching it.
 *
 * Seven fields wrote this out by hand. Everything else about each one —
 * label, whether it is required, what the help text says, when it is locked
 * — is the caller's, and passes through.
 */
export function CurrencyField({
  value,
  onChange,
  label,
  ...props
}: Omit<TextFieldProps, 'value' | 'onChange' | 'slotProps'> & {
  value: string;
  /** Called with the code already uppercased. */
  onChange: (currency: string) => void;
}) {
  const intl = useIntl();

  return (
    <TextField
      {...props}
      label={
        label ??
        intl.formatMessage({
          id: 'components.currency.label',
          defaultMessage: 'Currency',
        })
      }
      value={value}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      slotProps={{ htmlInput: { maxLength: 3 } }}
    />
  );
}
