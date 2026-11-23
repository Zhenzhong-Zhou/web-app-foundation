import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
} from '@mui/material';
import { type ReactNode, type Ref, useId } from 'react';
import { useIntl } from 'react-intl';

import type { ExpiryKind } from './lot-input';

/**
 * When a lot expires, one of three (ADR-094, R8): On a date, which asks
 * the day under it; Not known yet, which says the lot is marked until its
 * date is added; or Doesn't expire. The same in the lot fields, Edit lot
 * details and Start tracking lots.
 */
export function ExpiryChoice({
  idPrefix,
  expiry,
  expiresAt,
  onChange,
  required = true,
  help,
  expiryRef,
  dayRef,
  errors = {},
}: {
  /** Keeps the dialogs' field ids apart. */
  idPrefix: string;
  /** The choice, or null while none is made. */
  expiry: ExpiryKind | null;
  /** As the date input gives it, YYYY-MM-DD (ADR-052). */
  expiresAt: string;
  onChange: (next: { expiry?: ExpiryKind; expiresAt?: string }) => void;
  /** Start tracking lots' is optional (R14). */
  required?: boolean;
  /**
   * Said under the choices, in place of Not known yet's own line where
   * given: Start tracking lots says what its lot is then (ADR-094, S6).
   */
  help?: ReactNode;
  /** For a form that focuses the first field it refused (#310). */
  expiryRef?: Ref<HTMLInputElement>;
  dayRef?: Ref<HTMLInputElement>;
  errors?: { expiry?: string; day?: string };
}) {
  const intl = useIntl();
  const id = useId();
  const said =
    errors.expiry ??
    help ??
    (expiry === 'unknown'
      ? intl.formatMessage({
          id: 'inventory.lot.expiry.unknownHelp',
          defaultMessage:
            'Marked “Expiry to add” until its date is added. The stock can still be used.',
        })
      : undefined);

  return (
    <>
      <FormControl error={!!errors.expiry}>
        <FormLabel id={id} required={required}>
          {intl.formatMessage({
            id: 'inventory.lot.expires',
            defaultMessage: 'Expires',
          })}
        </FormLabel>
        <RadioGroup
          row
          aria-labelledby={id}
          aria-describedby={said ? `${id}-help` : undefined}
          value={expiry ?? ''}
          onChange={(event) =>
            onChange({ expiry: event.target.value as ExpiryKind })
          }
        >
          <FormControlLabel
            value="date"
            control={<Radio slotProps={{ input: { ref: expiryRef } }} />}
            label={intl.formatMessage({
              id: 'inventory.lot.expiry.date',
              defaultMessage: 'On a date',
            })}
          />
          <FormControlLabel
            value="unknown"
            control={<Radio />}
            label={intl.formatMessage({
              id: 'inventory.lot.expiry.unknown',
              defaultMessage: 'Not known yet',
            })}
          />
          <FormControlLabel
            value="none"
            control={<Radio />}
            label={intl.formatMessage({
              id: 'inventory.lot.expiry.none',
              defaultMessage: 'Doesn’t expire',
            })}
          />
        </RadioGroup>
        {said && <FormHelperText id={`${id}-help`}>{said}</FormHelperText>}
      </FormControl>

      {expiry === 'date' && (
        <TextField
          id={`${idPrefix}-lot-expires`}
          label={intl.formatMessage({
            id: 'inventory.lot.expiresDay',
            defaultMessage: 'The day it expires',
          })}
          type="date"
          required
          fullWidth
          value={expiresAt}
          onChange={(event) => onChange({ expiresAt: event.target.value })}
          inputRef={dayRef}
          error={!!errors.day}
          helperText={errors.day}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    </>
  );
}
