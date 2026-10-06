import { Autocomplete, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { api } from '../lib/api';
import { formatDay, SEPARATOR } from '../lib/format';
import type { Lot } from '../lib/types';

/** The lot as the form holds it: expiry as the date input gives it. */
export type LotInput = { code: string; expiresAt: string };

/**
 * The lot a receipt arrives in: its code, as printed on the box, and when it
 * expires. Used by both ways of receiving (ADR-023) — against nothing, and
 * against an order line. The dialogs themselves stay apart; these fields are
 * the part that was the same.
 *
 * Render it only for a lot-tracked variant. The server refuses a lot on a
 * variant that does not track them, and refuses a receipt without one on a
 * variant that does, so the form follows the same rule rather than offering
 * a field that will be rejected. Mounting with the variant is also what
 * fetches its lots once tracking is known.
 */
export function LotFields({
  idPrefix,
  variantId,
  value,
  onChange,
}: {
  /** Keeps the two dialogs' field ids apart. */
  idPrefix: string;
  variantId: string;
  value: LotInput;
  onChange: (next: LotInput) => void;
}) {
  const intl = useIntl();
  const [knownLots, setKnownLots] = useState<Lot[]>([]);

  /**
   * The codes already on this variant, so a typo shows the real one sitting
   * beside it. freeSolo below, because a genuinely new lot has to be
   * typeable: this is a prompt, not a constraint.
   */
  useEffect(() => {
    let ignore = false;

    void api<Lot[]>(`/stock/lots?variantId=${variantId}`)
      .then((rows) => {
        if (!ignore) setKnownLots(rows);
      })
      // Silent: the field still works typed, and an error here would be a
      // warning about an autocomplete nobody asked for.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [variantId]);

  return (
    <>
      <Autocomplete
        freeSolo
        options={knownLots}
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.code
        }
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Stack>
              <Typography variant="body2">{option.code}</Typography>
              {/* The expiry is how someone spots the other mistake: a code
                  that exists but belongs to another delivery. */}
              <Typography variant="caption" color="text.secondary">
                {option.expiresAt
                  ? intl.formatMessage(
                      {
                        id: 'inventory.lot.expiresOn',
                        defaultMessage: 'Expires {day}',
                      },
                      { day: formatDay(option.expiresAt) },
                    )
                  : intl.formatMessage({
                      id: 'inventory.lot.noExpiry',
                      defaultMessage: 'No expiry',
                    })}
                {option.isAssigned && (
                  <>
                    {SEPARATOR}
                    {intl.formatMessage({
                      id: 'inventory.lot.codeAssignedHere',
                      defaultMessage: 'code assigned here',
                    })}
                  </>
                )}
              </Typography>
            </Stack>
          </li>
        )}
        inputValue={value.code}
        onInputChange={(_event, code) => onChange({ ...value, code })}
        onChange={(_event, picked) => {
          if (typeof picked === 'string' || !picked) return;

          /**
           * Filled from the lot that was picked, because the server ignores
           * a supplied expiry when the lot already exists — a second delivery
           * does not rewrite the expiry of units already on the shelf.
           * Leaving the field as it was would let someone type a value that
           * silently does nothing.
           */
          onChange({
            code: picked.code,
            expiresAt: picked.expiresAt ?? '',
          });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            id={`${idPrefix}-lot-code`}
            label={intl.formatMessage({
              id: 'inventory.lot.number',
              defaultMessage: 'Lot number',
            })}
            required
            helperText={intl.formatMessage({
              id: 'inventory.lot.number.help',
              defaultMessage:
                'As printed on the box. Receiving the same lot again adds to it.',
            })}
          />
        )}
      />

      <TextField
        id={`${idPrefix}-lot-expires`}
        label={intl.formatMessage({
          id: 'inventory.lot.expires',
          defaultMessage: 'Expires',
        })}
        type="date"
        fullWidth
        value={value.expiresAt}
        onChange={(event) =>
          onChange({ ...value, expiresAt: event.target.value })
        }
        slotProps={{ inputLabel: { shrink: true } }}
        helperText={intl.formatMessage({
          id: 'inventory.lot.expires.helpReceive',
          defaultMessage:
            'Leave blank if it does not expire. Ignored if this lot already exists.',
        })}
      />
    </>
  );
}
