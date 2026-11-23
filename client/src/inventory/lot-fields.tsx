import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import { type ReactNode, type Ref, useCallback, useId, useRef } from 'react';
import { useIntl } from 'react-intl';

import type { Lot, NumberingEnvelope, StockCodePlaces } from '../api/types.gen';
import { SEPARATOR } from '../lib/format';
import { formatNumber } from '../lib/numbering';
import { useResource } from '../lib/use-resource';
import { displayWithUnit } from '../products/units';
import { lotExpiry } from './lot-expiry';
import {
  chosenExpiry,
  existingLot,
  type ExpiryKind,
  type LotErrors,
  type LotInput,
} from './lot-input';
import { placeName } from './stock-places';

/**
 * A new lot's fields (ADR-094), the same in Receive stock, an order's
 * Receive and Count it in…: the lot number, typed as printed or made for
 * us when saved; under a typed code, whether it is a lot the item has or
 * a new one (R10); the supplier's lot beside a made code (R5); and when a
 * new lot expires, one of three (R8). The dialogs themselves stay apart;
 * these fields are the part that is the same.
 *
 * Render it only for a lot-tracked variant. The server refuses a lot on a
 * variant that does not track them, and refuses a receipt without one on
 * a variant that does, so the form follows the same rule rather than
 * offering a field that will be rejected.
 */
export function LotFields({
  idPrefix,
  variantId,
  unitOfMeasure,
  lots,
  knowsLots,
  value,
  onChange,
  mustBeNew = false,
  codeRef,
  expiryRef,
  dayRef,
  errors = {},
}: {
  /** Keeps the dialogs' field ids apart. */
  idPrefix: string;
  variantId: string;
  /** The item's unit, for what an existing lot holds where. */
  unitOfMeasure: string;
  /** The item's lots, newest first (useItemLots). */
  lots: readonly Lot[];
  /** The lots could be read: a typed code is said to be new or existing. */
  knowsLots: boolean;
  value: LotInput;
  onChange: (update: (current: LotInput) => LotInput) => void;
  /**
   * Count it in's new lot (ADR-093, 84a): a code the item has is refused,
   * so the code is not offered from its lots, and one typed says so.
   */
  mustBeNew?: boolean;
  /** For a form that focuses the first field it refused (#310). */
  codeRef?: Ref<HTMLInputElement>;
  expiryRef?: Ref<HTMLInputElement>;
  dayRef?: Ref<HTMLInputElement>;
  /** Said at each field in place of its help (#310). */
  errors?: LotErrors;
}) {
  const intl = useIntl();
  const expiryId = useId();
  // Type one instead: the field empties, and focus goes into it as it
  // comes back.
  const typing = useRef(false);
  const focusTyped = useCallback((node: HTMLInputElement | null) => {
    if (node && typing.current) {
      typing.current = false;
      node.focus();
    }
  }, []);
  const codeInput = useForkRef(focusTyped, codeRef);

  const existing = knowsLots ? existingLot(value, lots) : undefined;
  const asksExpiry = mustBeNew || !existing;
  const expiry = chosenExpiry(value, lots);

  const set = (next: Partial<LotInput>) =>
    onChange((current) => ({ ...current, ...next }));

  const label = intl.formatMessage({
    id: 'inventory.lot.number',
    defaultMessage: 'Lot number',
  });
  const help =
    errors.code ??
    (knowsLots && value.code.trim() ? (
      <CodeLine
        lot={existing}
        mustBeNew={mustBeNew}
        variantId={variantId}
        unitOfMeasure={unitOfMeasure}
      />
    ) : (
      intl.formatMessage({
        id: 'inventory.lot.number.asPrinted',
        defaultMessage: 'As printed on the box.',
      })
    ));

  return (
    <>
      {value.made ? (
        <MadeCode id={`${idPrefix}-lot-code`} label={label} />
      ) : mustBeNew ? (
        <TextField
          id={`${idPrefix}-lot-code`}
          label={label}
          required
          fullWidth
          value={value.code}
          onChange={(event) => set({ code: event.target.value })}
          inputRef={codeInput}
          error={!!errors.code}
          helperText={help}
          slotProps={{ htmlInput: { maxLength: 64 } }}
        />
      ) : (
        <Autocomplete
          freeSolo
          options={lots as Lot[]}
          getOptionLabel={(option) =>
            typeof option === 'string' ? option : option.code
          }
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
              <Stack>
                <Typography variant="body2">{option.code}</Typography>
                {/* The expiry is how someone spots the other mistake: a
                    code that exists but belongs to another delivery. */}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {lotExpiry(option, intl)}
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
          onInputChange={(_event, typed) => set({ code: typed })}
          renderInput={(params) => (
            <TextField
              {...params}
              id={`${idPrefix}-lot-code`}
              label={label}
              required
              inputRef={codeInput}
              error={!!errors.code}
              helperText={help}
            />
          )}
        />
      )}

      {/* Under the field it changes, so the two read as one control. */}
      <Box sx={{ mt: -1 }}>
        {value.made ? (
          <Button
            size="small"
            onClick={() => {
              typing.current = true;
              set({ made: false, code: '' });
            }}
          >
            {intl.formatMessage({
              id: 'inventory.lot.typeInstead',
              defaultMessage: 'Type one instead',
            })}
          </Button>
        ) : (
          <Button size="small" onClick={() => set({ made: true })}>
            {intl.formatMessage({
              id: 'inventory.lot.makeCode',
              defaultMessage: 'Make a code for us',
            })}
          </Button>
        )}
      </Box>

      {value.made && (
        <TextField
          id={`${idPrefix}-supplier-lot`}
          label={intl.formatMessage({
            id: 'inventory.lot.supplierLot',
            defaultMessage: 'Supplier’s lot',
          })}
          fullWidth
          value={value.supplierLot}
          onChange={(event) => set({ supplierLot: event.target.value })}
          helperText={intl.formatMessage({
            id: 'inventory.lot.supplierLot.help',
            defaultMessage:
              'Optional. As the supplier printed it, if the box shows one; it can be added later.',
          })}
          slotProps={{ htmlInput: { maxLength: 64 } }}
        />
      )}

      {asksExpiry && (
        <FormControl error={!!errors.expiry}>
          <FormLabel id={expiryId} required>
            {intl.formatMessage({
              id: 'inventory.lot.expires',
              defaultMessage: 'Expires',
            })}
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={expiryId}
            aria-describedby={
              errors.expiry || expiry === 'unknown'
                ? `${expiryId}-help`
                : undefined
            }
            value={expiry ?? ''}
            onChange={(event) =>
              set({ expiry: event.target.value as ExpiryKind })
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
          {(errors.expiry || expiry === 'unknown') && (
            <FormHelperText id={`${expiryId}-help`}>
              {errors.expiry ??
                intl.formatMessage({
                  id: 'inventory.lot.expiry.unknownHelp',
                  defaultMessage:
                    'Marked “Expiry to add” until its date is added. The stock can still be used.',
                })}
            </FormHelperText>
          )}
        </FormControl>
      )}

      {asksExpiry && expiry === 'date' && (
        <TextField
          id={`${idPrefix}-lot-expires`}
          label={intl.formatMessage({
            id: 'inventory.lot.expiresDay',
            defaultMessage: 'The day it expires',
          })}
          type="date"
          required
          fullWidth
          value={value.expiresAt}
          onChange={(event) => set({ expiresAt: event.target.value })}
          inputRef={dayRef}
          error={!!errors.day}
          helperText={errors.day}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    </>
  );
}

/**
 * The lot number while a code is made for us: read only, saying it is
 * made when the write is saved, with the code the lot series would give
 * now (ADR-094, R3), which another receipt may take first. Without the
 * numbering, which a role may not read, the words alone.
 */
function MadeCode({ id, label }: { id: string; label: string }) {
  const intl = useIntl();
  const { data } = useResource<NumberingEnvelope>('/organization/numbering');
  const series = data?.numbering.lot;
  const example =
    series && data
      ? formatNumber(
          series.prefix,
          series.digits,
          series.next[series.reset],
          data.numbering.today,
        )
      : null;

  return (
    <TextField
      id={id}
      label={label}
      fullWidth
      value={
        example
          ? intl.formatMessage(
              {
                id: 'inventory.lot.madeWhenSaved',
                defaultMessage: 'Made when you save, like {example}',
              },
              { example },
            )
          : intl.formatMessage({
              id: 'inventory.lot.madeWhenSavedPlain',
              defaultMessage: 'Made when you save',
            })
      }
      slotProps={{ htmlInput: { readOnly: true } }}
      sx={{ '& input': { color: 'text.secondary' } }}
    />
  );
}

/**
 * Under a typed code, which lot it is (R10): one the item has, which this
 * adds to, with its expiry and what is where; or a new lot. For Count it
 * in's new lot, a code the item has is one to choose among its lots.
 */
function CodeLine({
  lot,
  mustBeNew,
  variantId,
  unitOfMeasure,
}: {
  lot: Lot | undefined;
  mustBeNew: boolean;
  variantId: string;
  unitOfMeasure: string;
}) {
  const intl = useIntl();
  const { data } = useResource<StockCodePlaces>(
    lot && !mustBeNew ? `/stock/by-code/${variantId}/places` : null,
  );

  if (!lot) {
    return (
      <>
        {intl.formatMessage({
          id: 'inventory.lot.isNew',
          defaultMessage: 'A new lot.',
        })}
      </>
    );
  }
  if (mustBeNew) {
    return (
      <>
        {intl.formatMessage({
          id: 'inventory.lot.alreadyOne',
          defaultMessage:
            'Already one of its lots. Choose One of its lots for it, or type another code.',
        })}
      </>
    );
  }

  const piles = (data?.places ?? []).flatMap((place) =>
    place.lots
      .filter((pile) => pile.lotId === lot.id)
      .map((pile) => ({ place, quantity: pile.quantity })),
  );
  let where: ReactNode = null;
  if (data && !piles.length) {
    where = intl.formatMessage({
      id: 'inventory.stock.noneOnHand',
      defaultMessage: 'None on hand',
    });
  } else if (piles.length && piles.every((pile) => pile.place.locationName)) {
    where = intl.formatList(
      piles.map((pile) =>
        intl.formatMessage(
          {
            id: 'inventory.lot.atPlace',
            defaultMessage: '{quantity} at {place}',
          },
          {
            quantity: displayWithUnit(pile.quantity, unitOfMeasure, intl),
            place: placeName(pile.place),
          },
        ),
      ),
    );
  }
  // A reader who may not see places is told its expiry alone (ADR-080):
  // the client adds no quantities up (ADR-025).

  return (
    <>
      {intl.formatMessage({
        id: 'inventory.lot.isExisting',
        defaultMessage: 'An existing lot. This adds to it.',
      })}
      <br />
      {lotExpiry(lot, intl)}
      {where && (
        <>
          {SEPARATOR}
          {where}
        </>
      )}
    </>
  );
}
