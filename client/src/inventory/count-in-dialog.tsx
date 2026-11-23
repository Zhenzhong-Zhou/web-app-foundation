import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type SubmitEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { Location, Lot, RecordedMovementEnvelope } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { Reference } from '../components/reference';
import { api, hasCode } from '../lib/api';
import { groupedNumberMessage, SEPARATOR, toApiDecimal } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { displayWithUnit, unitLabel } from '../products/units';
import { lotExpiry } from './lot-expiry';
import { LotFields } from './lot-fields';
import { type LotErrors, lotErrors, lotRequest, NO_LOT } from './lot-input';
import { useLotMessage } from './lot-received';
import { movementsPath } from './movements-path';
import { placePaths } from './stock-places';

/** The code whose found stock is counted in. */
export interface CountInItem {
  variantId: string;
  sku: string;
  unitOfMeasure: string;
  /** Tracked by lot: Which lot is asked, one of its lots or a new one. */
  tracksLots: boolean;
}

type Which = '' | 'existing' | 'new';

const EMPTY = {
  locationId: '',
  which: '' as Which,
  lotId: '',
  lot: NO_LOT,
  quantity: '',
  note: '',
};

/**
 * Correct the count for stock found where the item has never been
 * (ADR-093, R26, 84a and 90a): any place that holds stock, and for an
 * item tracked by lot, one of its lots or a new one made with the count,
 * neither chosen at first. Still an adjustment, its reason found, so it
 * needs stock.adjust and a note, as every correction does (ADR-023).
 */
export function CountInDialog({
  item,
  locations,
  tree,
  defaultLocationId = '',
  canSeeCosts,
  onClose,
  onCounted,
}: {
  item: CountInItem;
  /** The places stock can sit in, as the other dialogs list them. */
  locations: Location[];
  /**
   * Every location, the places' parents among them, so each place is
   * listed by its path (#631).
   */
  tree: Location[];
  /** The place chosen already: Receive stock's, from Found in a count (R12). */
  defaultLocationId?: string;
  /** costs.view: the message links to Waiting for a cost, else Movements. */
  canSeeCosts: boolean;
  onClose: () => void;
  /** Saved: the page reads again, the place counted into opened. */
  onCounted: (locationId: string) => void | Promise<void>;
}) {
  const pathOf = useMemo(() => placePaths(tree), [tree]);
  const intl = useIntl();
  const navigate = useNavigate();
  const say = useLotMessage();
  const whichId = useId();
  const [form, setForm] = useState({
    ...EMPTY,
    locationId: defaultLocationId,
  });
  // Said at its field: Which lot unchosen, a quantity with a separator.
  const [whichError, setWhichError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const firstLot = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  // The new lot's own refusals, each at its field (#310).
  const [lotProblems, setLotProblems] = useState<LotErrors>({});

  // Its lots, for One of its lots and to say a new code is one of them.
  // Silent if they fail: a new lot still can be made.
  const read = useResource<Lot[]>(
    item.tracksLots ? `/stock/lots?variantId=${item.variantId}` : null,
  ).data;
  const lots = read ?? [];

  const unit = unitLabel(item.unitOfMeasure, intl);
  const place = locations.find((each) => each.id === form.locationId);

  /**
   * "Counted in 12 each of VITC-100 at Shelf C3, new lot VC-0310.", the
   * lot as the write names it, a code made for us to write on the stock.
   */
  function said(result: RecordedMovementEnvelope) {
    const made = form.which === 'new' && form.lot.made;
    const lot = !item.tracksLots ? 'none' : made ? 'made' : form.which;
    const code = result.lotCode ?? '';
    const counted = intl.formatMessage(
      {
        id: 'inventory.countIn.done',
        defaultMessage:
          '{lot, select, made {Counted in {amount} of {sku} at {place}, new lot {code}. Write this code on the stock.} new {Counted in {amount} of {sku} at {place}, new lot {code}.} existing {Counted in {amount} of {sku} at {place}, lot {code}.} other {Counted in {amount} of {sku} at {place}.}}',
      },
      {
        lot,
        amount: displayWithUnit(
          result.movement.quantity,
          item.unitOfMeasure,
          intl,
        ),
        sku: item.sku,
        place: place?.name ?? '',
        code,
      },
    );

    // A new lot, an item with no cost yet, or stock joining any that still
    // waits (#650) waits for a cost, and links to Stock value's Waiting for
    // a cost for whoever may set one (90a); otherwise to its Movements at
    // that place.
    const waits = result.needsCost;
    say(
      waits
        ? intl.formatMessage(
            {
              id: 'inventory.countIn.waits',
              defaultMessage: '{counted} It waits for a cost.',
            },
            { counted },
          )
        : counted,
      code ? { id: result.movement.lotId, code, made } : null,
      [
        waits && canSeeCosts
          ? {
              label: intl.formatMessage({
                id: 'costs.waiting',
                defaultMessage: 'Waiting for a cost',
              }),
              onClick: () =>
                void navigate('/costs#costs', { state: OFFER_BACK }),
            }
          : {
              label: intl.formatMessage({
                id: 'layout.nav.movements',
                defaultMessage: 'Movements',
              }),
              onClick: () =>
                void navigate(
                  movementsPath({
                    variantId: item.variantId,
                    locationId: form.locationId,
                  }),
                  { state: OFFER_BACK },
                ),
            },
      ],
    );
  }

  const { submitting, error, errorCode, reset, submit } =
    useSubmit<RecordedMovementEnvelope>(async (result) => {
      said(result);
      onClose();
      await onCounted(form.locationId);
    });

  // A code the item already has is said at the new lot's code, and focus
  // goes there (ADR-093's table, as the dialog's other refusals).
  const taken = hasCode(errorCode, 'lot_code_in_use');
  useEffect(() => {
    if (taken) codeRef.current?.focus();
  }, [taken]);

  // A change clears a refusal about the values sent, as a fixed field
  // stops saying it is wrong.
  function change(next: Partial<typeof EMPTY>) {
    setForm((current) => ({ ...current, ...next }));
    reset();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (item.tracksLots && form.which === '') {
      setWhichError(
        intl.formatMessage({
          id: 'inventory.countIn.chooseLot',
          defaultMessage: 'Choose one of its lots, or a new lot.',
        }),
      );
      firstLot.current?.focus();
      return;
    }

    // The language's decimal comma becomes the point the API takes; a
    // thousands separator is refused here rather than guessed at (ADR-054).
    const quantity = toApiDecimal(form.quantity);
    if (quantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    // The new lot's own check, focus on the first it refused (#310).
    if (item.tracksLots && form.which === 'new') {
      const found = lotErrors(form.lot, lots, intl, true);
      setLotProblems(found);
      const first = (
        [
          ['code', codeRef],
          ['expiry', expiryRef],
          ['day', dayRef],
        ] as const
      ).find(([field]) => found[field]);
      if (first) {
        first[1].current?.focus();
        return;
      }
    }

    const lot = !item.tracksLots
      ? {}
      : form.which === 'new'
        ? {
            // A new lot, never added to one of the same code: the server
            // refuses a code the item has, since one of its lots is
            // chosen by its id (ADR-093, 84a; #649's 46).
            lot: lotRequest(form.lot, lots, true),
          }
        : { lotId: form.lotId };

    void submit(() =>
      api<RecordedMovementEnvelope>('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: item.variantId,
          toLocationId: form.locationId,
          ...lot,
          quantity,
          reason: 'adjustment',
          reasonDetail: 'found',
          note: form.note,
        }),
      }),
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'inventory.move.adjust.title',
            defaultMessage: 'Correct the count',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && !taken && <FormError message={error} />}

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage(
                {
                  id: 'inventory.countIn.what',
                  defaultMessage: 'Found {sku} where it has never been',
                },
                { sku: <Reference>{item.sku}</Reference> },
              )}
            </Typography>

            <TextField
              id="count-in-location"
              label={intl.formatMessage({
                id: 'inventory.location',
                defaultMessage: 'Location',
              })}
              select
              required
              fullWidth
              value={form.locationId}
              onChange={(event) => change({ locationId: event.target.value })}
              helperText={intl.formatMessage({
                id: 'inventory.leavesOnly',
                defaultMessage:
                  'Only locations that hold stock directly are listed.',
              })}
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {pathOf(location.id)}
                </MenuItem>
              ))}
            </TextField>

            {item.tracksLots && (
              <FormControl error={!!whichError}>
                <FormLabel id={whichId} required>
                  {intl.formatMessage({
                    id: 'inventory.countIn.whichLot',
                    defaultMessage: 'Which lot',
                  })}
                </FormLabel>
                <RadioGroup
                  aria-labelledby={whichId}
                  aria-describedby={whichError ? `${whichId}-error` : undefined}
                  value={form.which}
                  onChange={(event) => {
                    setWhichError(null);
                    change({ which: event.target.value as Which });
                  }}
                >
                  <FormControlLabel
                    value="existing"
                    control={<Radio slotProps={{ input: { ref: firstLot } }} />}
                    label={intl.formatMessage({
                      id: 'inventory.countIn.itsLots',
                      defaultMessage: 'One of its lots',
                    })}
                  />
                  <FormControlLabel
                    value="new"
                    control={<Radio />}
                    label={intl.formatMessage({
                      id: 'inventory.countIn.newLot',
                      defaultMessage: 'A new lot',
                    })}
                  />
                </RadioGroup>
                {whichError && (
                  <FormHelperText id={`${whichId}-error`}>
                    {whichError}
                  </FormHelperText>
                )}
              </FormControl>
            )}

            {form.which === 'existing' && (
              <TextField
                id="count-in-lot"
                label={intl.formatMessage({
                  id: 'inventory.lot',
                  defaultMessage: 'Lot',
                })}
                select
                required
                fullWidth
                value={form.lotId}
                onChange={(event) => change({ lotId: event.target.value })}
              >
                {lots.map((lot) => (
                  <MenuItem key={lot.id} value={lot.id}>
                    {lot.code}
                    {SEPARATOR}
                    {lotExpiry(lot, intl)}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {form.which === 'new' && (
              <LotFields
                idPrefix="count-in"
                variantId={item.variantId}
                unitOfMeasure={item.unitOfMeasure}
                lots={lots}
                knowsLots={read !== null}
                mustBeNew
                value={form.lot}
                onChange={(update) => {
                  setLotProblems({});
                  setForm((current) => ({
                    ...current,
                    lot: update(current.lot),
                  }));
                  reset();
                }}
                codeRef={codeRef}
                expiryRef={expiryRef}
                dayRef={dayRef}
                errors={{
                  ...lotProblems,
                  // A code the item has, said at the code (ADR-093's table).
                  code: taken ? (error ?? undefined) : lotProblems.code,
                }}
              />
            )}

            <TextField
              id="count-in-quantity"
              label={intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                setQuantityError(null);
                change({ quantity: event.target.value });
              }}
              error={!!quantityError}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              helperText={
                quantityError ??
                intl.formatMessage(
                  {
                    id: 'inventory.quantity.inUnit',
                    defaultMessage: 'In {unit}. Up to 4 decimal places.',
                  },
                  { unit },
                )
              }
            />

            {/* Required, as on every correction: a person asserting the
                system is wrong (ADR-023). */}
            <TextField
              id="count-in-note"
              label={intl.formatMessage({
                id: 'inventory.move.whatHappened',
                defaultMessage: 'What happened',
              })}
              required
              fullWidth
              multiline
              minRows={2}
              value={form.note}
              onChange={(event) => change({ note: event.target.value })}
              helperText={intl.formatMessage({
                id: 'inventory.move.whatHappened.help',
                defaultMessage:
                  'Whoever reads this in six months was not there.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          label={intl.formatMessage({
            id: 'inventory.move.adjust.verb',
            defaultMessage: 'Save correction',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
