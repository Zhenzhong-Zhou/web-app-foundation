import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  IconButton,
  InputAdornment,
  TextField,
  type TextFieldProps,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

/**
 * A password field with a button to show what was typed, and hide it again.
 *
 * Mistyping is the commonest reason a sign-in fails, and on a phone it is
 * hard to see; showing the text lets a person check it before sending
 * (WCAG 2.2, 3.3.8; NIST SP 800-63B recommends the option). Hidden is
 * always the start, each field toggles on its own — showing a new password
 * never shows the current one — and the state goes with the field, so
 * leaving the page hides it again. autoComplete passes through, so
 * password managers still know the field.
 *
 * The button's name says what pressing it does, "Show password" or "Hide
 * password"; its icon is the state it would move to.
 */
export function PasswordField({
  slotProps,
  ...props
}: Omit<TextFieldProps, 'type'>) {
  const intl = useIntl();
  const [shown, setShown] = useState(false);

  const label = shown
    ? intl.formatMessage({
        id: 'auth.password.hide',
        defaultMessage: 'Hide password',
      })
    : intl.formatMessage({
        id: 'auth.password.show',
        defaultMessage: 'Show password',
      });

  return (
    <TextField
      {...props}
      type={shown ? 'text' : 'password'}
      slotProps={{
        ...slotProps,
        input: {
          ...(slotProps?.input as object | undefined),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                aria-label={label}
                onClick={() => setShown((on) => !on)}
              >
                {shown ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
