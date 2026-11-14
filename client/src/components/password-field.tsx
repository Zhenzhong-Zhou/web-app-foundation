import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  IconButton,
  InputAdornment,
  TextField,
  type TextFieldProps,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
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
 *
 * Submitting the form hides it again. A sign-in that fails, or a change
 * the server refuses, leaves the person on the page, and a password left
 * showing while they read the error is one anybody nearby can read too.
 *
 * Its label sits raised above the field from the start, as MUI raises it
 * itself for an adornment at a field's start but not at its end: a label
 * at rest inside the field may run the field's whole width but its
 * padding, so a long one, « Choisissez un mot de passe » on a 320 px phone
 * at Larger text, ran under the eye button and was cut (ADR-054's November
 * 2026 amendment, R9; e2e/cut-text.spec.ts). Raised, it has the field's
 * top edge to itself.
 */
export function PasswordField({
  slotProps,
  ...props
}: Omit<TextFieldProps, 'type' | 'inputRef'>) {
  const intl = useIntl();
  const [shown, setShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The form is found through the input, so no caller has to pass it.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;

    const hide = () => setShown(false);
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);

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
      inputRef={inputRef}
      type={shown ? 'text' : 'password'}
      slotProps={{
        ...slotProps,
        inputLabel: {
          ...(slotProps?.inputLabel as object | undefined),
          shrink: true,
        },
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
