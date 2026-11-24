import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import { type ReactNode, type Ref, useCallback, useRef } from 'react';
import { useIntl } from 'react-intl';

import type { Lot, StockCodePlaces } from '../api/types.gen';
import { SEPARATOR } from '../lib/format';
import { useResource } from '../lib/use-resource';
import { displayWithUnit } from '../products/units';
import { ExpiryChoice } from './expiry-choice';
import { lotExpiry } from './lot-expiry';
import {
  chosenExpiry,
  existingLot,
  type LotErrors,
  type LotInput,
  useNextLotCode,
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
  expiryStart,
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
  /** Where Expires started, said under it (ExpiryChoice's `start`). */
  expiryStart?: string;
}) {
  const intl = useIntl();
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
        <MadeCode
          id={`${idPrefix}-lot-code`}
          // Our own code, which Chinese names 批次编码 as its button does,
          // never the printed 批号 (review 7).
          label={intl.formatMessage({
            id: 'inventory.lot.madeCode',
            defaultMessage: 'Lot number',
          })}
        />
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
        <ExpiryChoice
          idPrefix={idPrefix}
          expiry={expiry}
          expiresAt={value.expiresAt}
          onChange={set}
          expiryRef={expiryRef}
          dayRef={dayRef}
          errors={errors}
          start={expiryStart}
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
  const example = useNextLotCode();

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
      // What the code is, as v15's board says under it (review 35).
      helperText={intl.formatMessage({
        id: 'inventory.lot.madeCode.help',
        defaultMessage:
          'Our own code. Add the supplier’s lot when you have it.',
      })}
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
