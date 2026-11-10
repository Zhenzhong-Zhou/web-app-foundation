import Delete from '@mui/icons-material/Delete';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useId, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';

import type { Location, Partner, VariantOption } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { chosenCardSx } from '../components/chosen-card';
import { CurrencyField } from '../components/currency-field';
import { FormError } from '../components/form-error';
import { PartnerPicker } from '../components/partner-picker';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { VariantPicker } from '../components/variant-picker';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { fieldQuantity } from '../inventory/reorder-points';
import { api, isRevisionRefusal } from '../lib/api';
import type { OrderDirection } from '../lib/api-names';
import { BLANK_LINE, groupedNumberMessage, toApiDecimal } from '../lib/format';
import { usePartners } from '../lib/use-partners';
import { useSubmit } from '../lib/use-submit';
import { useUnsavedChanges } from '../lib/use-unsaved-changes';
import { useVariants } from '../lib/use-variants';
import { SiteSelect } from '../locations/site-select';
import { unitLabel } from '../products/units';
import { rem } from '../theme/rem';
import { directionOf, orderFillOf } from './order-fill';

interface LineDraft {
  /** Local only — React needs a stable key before the row has a variant. */
  key: string;
  variant: VariantOption | null;
  quantityOrdered: string;
  unitPrice: string;
}

/** Sell or Buy, in the order the question asks it (#454). */
const DIRECTIONS: readonly OrderDirection[] = ['sale', 'purchase'];

const DIRECTION_NAMES = defineMessages<OrderDirection>({
  sale: { id: 'orders.direction.selling', defaultMessage: 'Selling' },
  purchase: { id: 'orders.direction.buying', defaultMessage: 'Buying' },
});

const DIRECTION_LINES = defineMessages<OrderDirection>({
  sale: {
    id: 'orders.direction.sale.help',
    defaultMessage: 'Stock leaves. Receiving does not apply to a sale.',
  },
  purchase: {
    id: 'orders.direction.purchase.help',
    defaultMessage: 'Stock arrives, and is received against this order.',
  },
});

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    variant: null,
    quantityOrdered: '',
    unitPrice: '',
  };
}

/**
 * Raising an order: the header and its lines, posted once.
 *
 * A page rather than a dialog, unlike every other create in this app. An
 * order has a repeating section with no fixed height, and a dialog that
 * scrolls its own body while the page scrolls behind it is the shape people
 * lose their place in.
 *
 * One request, because the server writes the header and lines in one
 * transaction (ADR-027) — an order with no lines is a document that orders
 * nothing, and a failure between two requests would leave one behind.
 */
export function CreateOrderPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const can = useCan();
  const canSeeLocations = can('locations.view');

  const intl = useIntl();
  // A count that reads the partners and the products again.
  const [reads, setReads] = useState(0);
  const {
    partners,
    answered: partnersAnswered,
    failure: loadFailure,
  } = usePartners(true, reads);
  const {
    variants,
    answered: catalogueAnswered,
    failed: catalogueFailed,
  } = useVariants(true, reads);
  // Set when a quantity or price is typed with a thousands separator.
  const [numberError, setNumberError] = useState<string | null>(null);

  const [partner, setPartner] = useState<Partner | null>(null);
  /**
   * Asked, neither chosen, unless the link that opened the form knows
   * (#454): a partner may be a customer, a supplier or both, so nothing
   * else here can tell which way the goods go.
   */
  const [direction, setDirection] = useState<OrderDirection | null>(() =>
    directionOf(state),
  );
  const [directionMissing, setDirectionMissing] = useState(false);
  const directionId = useId();
  const firstDirection = useRef<HTMLInputElement>(null);
  const [isSample, setIsSample] = useState(false);
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  /**
   * Lines filled in from Reorder points (ADR-085), each item at its
   * suggestion, once the catalogue has answered with its items, after a
   * failed read's Retry too (#357); the supplier is left to choose. Read
   * from the link once, so what the person changes afterwards stays
   * theirs. The note counts the lines filled, an item no longer in the
   * catalogue left out.
   */
  const [fill] = useState(() => orderFillOf(state));
  const [filling, setFilling] = useState(fill !== null);
  const [filledCount, setFilledCount] = useState(0);
  if (filling && fill && catalogueAnswered && !catalogueFailed) {
    setFilling(false);
    const filled = fill.lines.flatMap((line) => {
      const variant = variants.find((option) => option.id === line.variantId);
      return variant
        ? [
            {
              ...emptyLine(),
              variant,
              quantityOrdered: fieldQuantity(line.quantity),
            },
          ]
        : [];
    });
    setFilledCount(filled.length);
    if (filled.length) setLines(filled);
  }

  /**
   * Where a purchase is delivered (ADR-071, amended). Null until someone
   * picks, when the organization's one site stands in, as the server would
   * choose it; with several, nothing is guessed.
   */
  const [locations, setLocations] = useState<Location[]>([]);
  const [deliverTo, setDeliverTo] = useState<string | null>(null);
  const activeSites = locations.filter(
    (location) => location.type === 'site' && location.isActive,
  );
  const deliverToId =
    deliverTo ?? (activeSites.length === 1 ? activeSites[0].id : '');

  /**
   * One field for the whole order, though the column is per line (ADR-035).
   * A mixed-currency order is supported and rare, and it can be made by
   * editing a line afterwards — asking on every row here would be friction
   * on the case that almost never happens.
   */
  const [currency, setCurrency] = useState('');

  // Anything typed or chosen is worth asking about before it is thrown away
  // (issue #54); an untouched form leaves without a word.
  const dirty =
    partner !== null ||
    reference.trim() !== '' ||
    expectedAt !== '' ||
    note.trim() !== '' ||
    isSample ||
    lines.some(
      (line) =>
        line.variant !== null ||
        line.quantityOrdered !== '' ||
        line.unitPrice !== '',
    );
  const { blocker, release } = useUnsavedChanges(dirty);

  const { submitting, error, submit } = useSubmit(
    () => {
      // Nothing to reset — the page unmounts on success.
    },
    {
      success: intl.formatMessage({
        id: 'orders.raised',
        defaultMessage: 'Order raised',
      }),
    },
  );

  // Apart from the partners and products: without them the field is not
  // offered, and the server still delivers to the one site there is. Asked
  // only by whoever may see locations, which Sales may not (ADR-080); the
  // order's Edit then says why Deliver to cannot be chosen.
  useEffect(() => {
    if (!canSeeLocations) return;

    let ignore = false;

    void api<Location[]>('/locations')
      .then((rows) => {
        if (!ignore) setLocations(rows);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [canSeeLocations]);

  /**
   * Retired partners are filtered out here, as they are from a sample's
   * Given to and Plan run's Contract manufacturer.
   *
   * The directory lists them, because a name that vanished is harder to
   * explain than one shown as inactive (ADR-026). Here choosing one is
   * refused — the server answers with a 409, and an option that always
   * fails is worse than an option that is absent.
   */
  const selectablePartners = partners.filter((row) => row.isActive);

  /**
   * A variant already on the order is not offered again. order_lines is
   * unique on (order_id, variant_id): two lines for one item make "how much
   * did we order" ambiguous, and amending the quantity is what editing is
   * for. Catching it here means the 409 is a backstop rather than the way
   * people find out.
   */
  const chosen = new Set(
    lines.map((line) => line.variant?.id).filter(Boolean) as string[],
  );

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  const complete = lines.filter(
    (line) => line.variant && line.quantityOrdered.trim(),
  );

  const canSubmit = !!partner && complete.length > 0 && !submitting;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partner) return;
    // Said at the field, and focus taken there, as every refusal is.
    if (!direction) {
      setDirectionMissing(true);
      firstDirection.current?.focus();
      return;
    }

    // Each number as the API takes it: the language's decimal comma made a
    // point, a thousands separator refused rather than guessed (ADR-054).
    const numbers = complete.map((line) => ({
      quantity: toApiDecimal(line.quantityOrdered),
      price: line.unitPrice.trim() ? toApiDecimal(line.unitPrice) : '',
    }));
    if (numbers.some((row) => row.quantity === null || row.price === null)) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(async () => {
      const created = await api<{ order: { id: string } }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          partnerId: partner.id,
          direction,
          // Sales only; the server refuses it on a purchase (ADR-042).
          isSample: direction === 'sale' && isSample ? true : undefined,
          reference: reference || undefined,
          // A date input yields YYYY-MM-DD, which IsISO8601 accepts. Sent as
          // typed rather than converted: expected_at is a calendar day
          // somebody chose, and building a Date here would pin it to this
          // browser's midnight.
          // As typed, YYYY-MM-DD (ADR-052).
          expectedAt: expectedAt || undefined,
          note: note || undefined,
          // Not chosen, picked, is none even beside the one site; left
          // alone, the site shown, or the server's own choice.
          deliverToId:
            direction !== 'purchase'
              ? undefined
              : deliverTo === ''
                ? null
                : deliverToId || undefined,
          /**
           * Quantities and prices stay strings from the input to the column. A
           * JSON number has already been through a double before any validator
           * sees it (ADR-025), and 2.75 kg of raw material is ordinary — as is a
           * price like 0.0125.
           */
          lines: complete.map((line, index) => ({
            variantId: line.variant!.id,
            quantityOrdered: numbers[index].quantity!,
            // Both or neither: the server refuses half a price, and a blank
            // field means this line simply has none yet.
            unitPrice: numbers[index].price || undefined,
            currency: numbers[index].price ? currency : undefined,
          })),
        }),
      });

      // Saved: on to the order, without asking. Filled from Reorder points,
      // the order takes New order's place in the history, so Back returns
      // to the list, not to the same lines filled in again (ADR-085).
      release();
      navigate(`/orders/${created.order.id}`, { replace: fill !== null });
    });
  }

  // Refused for this tab's API revision, as every page is (ADR-081): why,
  // in the form's place, which nothing could have been typed into yet.
  if (isRevisionRefusal(loadFailure)) {
    return (
      <RevisionRefusalPage
        failure={loadFailure}
        onRetry={() => setReads((count) => count + 1)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <UnsavedChangesDialog
        blocker={blocker}
        message={intl.formatMessage({
          id: 'orders.create.unsaved',
          defaultMessage:
            'The order you started has not been raised. Leaving loses its partner and lines.',
        })}
      />
      <Stack spacing={3}>
        <Typography variant="h5" component="h1">
          {intl.formatMessage({
            id: 'orders.raise',
            defaultMessage: 'Raise an order',
          })}
        </Typography>

        {filledCount > 0 && (
          <Alert severity="info">
            {intl.formatMessage(
              {
                id: 'orders.create.filled',
                defaultMessage:
                  'Filled from Reorder points: {count, plural, one {# line at its suggested quantity} other {# lines at their suggested quantities}}. Choose the supplier under Partner, check the quantities and prices, then raise it as a draft.',
              },
              { count: filledCount },
            )}
          </Alert>
        )}

        {(loadFailure !== null || catalogueFailed) && (
          <Alert severity="error">
            {intl.formatMessage({
              id: 'orders.create.loadFailed',
              defaultMessage: 'Could not load partners and items.',
            })}
          </Alert>
        )}
        {(numberError ?? error) && (
          <FormError message={(numberError ?? error)!} />
        )}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            {/* Which way the goods go, asked first (#454). A column and not
                a table (ADR-027): two values the service branches on,
                carrying no attributes. */}
            <Box
              component="fieldset"
              aria-describedby={
                directionMissing ? `${directionId}-problem` : undefined
              }
              sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
            >
              <FormLabel
                component="legend"
                id={`${directionId}-legend`}
                required
                error={directionMissing}
                sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}
              >
                {intl.formatMessage({
                  id: 'orders.direction',
                  defaultMessage: 'Direction',
                })}
              </FormLabel>
              {directionMissing && (
                <FormHelperText
                  error
                  id={`${directionId}-problem`}
                  sx={{ mx: 0, mt: -0.5, mb: 1 }}
                >
                  {intl.formatMessage({
                    id: 'orders.create.directionMissing',
                    defaultMessage: 'Choose Selling or Buying.',
                  })}
                </FormHelperText>
              )}
              <RadioGroup
                aria-labelledby={`${directionId}-legend`}
                aria-required
                value={direction ?? ''}
                onChange={(event) => {
                  const next = event.target.value as OrderDirection;
                  setDirection(next);
                  setDirectionMissing(false);
                  // A purchase cannot be a sample, so switching away clears
                  // it rather than sending a flag the server would refuse.
                  if (next === 'purchase') setIsSample(false);
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${rem(200)}, 1fr))`,
                  gap: 1,
                }}
              >
                {DIRECTIONS.map((choice) => (
                  <FormControlLabel
                    key={choice}
                    value={choice}
                    control={
                      <Radio
                        slotProps={{
                          input: {
                            ref:
                              choice === DIRECTIONS[0]
                                ? firstDirection
                                : undefined,
                          },
                        }}
                      />
                    }
                    label={
                      <Box component="span" sx={{ display: 'block', py: 0.5 }}>
                        <Box component="span" sx={{ fontWeight: 600 }}>
                          {intl.formatMessage(DIRECTION_NAMES[choice])}
                        </Box>
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{ color: 'text.secondary', display: 'block' }}
                        >
                          {intl.formatMessage(DIRECTION_LINES[choice])}
                        </Typography>
                      </Box>
                    }
                    sx={chosenCardSx(direction === choice)}
                  />
                ))}
              </RadioGroup>
            </Box>

            <PartnerPicker
              id="order-partner"
              label={intl.formatMessage({
                id: 'orders.partner',
                defaultMessage: 'Partner',
              })}
              required
              options={selectablePartners}
              loading={!partnersAnswered}
              value={partner?.id ?? ''}
              onChange={(partnerId) =>
                setPartner(
                  selectablePartners.find((row) => row.id === partnerId) ??
                    null,
                )
              }
            />

            {direction === 'purchase' && activeSites.length > 0 && (
              <SiteSelect
                id="order-deliver-to"
                label={intl.formatMessage({
                  id: 'orders.deliverTo',
                  defaultMessage: 'Deliver to',
                })}
                value={deliverToId}
                onChange={setDeliverTo}
                locations={locations}
                emptyLabel={intl.formatMessage({
                  id: 'orders.deliverTo.none',
                  defaultMessage: 'Not chosen',
                })}
                emptyHelp={intl.formatMessage({
                  id: 'orders.deliverTo.noneHelp',
                  defaultMessage:
                    'The purchase order prints the registered address.',
                })}
              />
            )}

            {/* A sample ships, prints and traces exactly like a sale — the
                lots it takes are found by a recall the same way. The flag is
                for telling them apart afterwards, not for a different flow
                (ADR-042). */}
            {direction === 'sale' && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSample}
                    onChange={(event) => setIsSample(event.target.checked)}
                  />
                }
                label={intl.formatMessage({
                  id: 'orders.create.isSample',
                  defaultMessage:
                    'This is a sample — price it at zero if it is free',
                })}
              />
            )}

            <Stack direction="row" spacing={2}>
              <TextField
                label={intl.formatMessage({
                  id: 'orders.theirReference',
                  defaultMessage: 'Their reference',
                })}
                fullWidth
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'orders.theirReference.help',
                  defaultMessage:
                    'Their number for this order, not ours. Optional.',
                })}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />

              <TextField
                label={intl.formatMessage({
                  id: 'orders.expected',
                  defaultMessage: 'Expected',
                })}
                type="date"
                fullWidth
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <CurrencyField
                id="order-currency"
                value={currency}
                onChange={setCurrency}
                helperText={intl.formatMessage({
                  id: 'orders.create.currency.help',
                  defaultMessage: 'For any prices below',
                })}
                sx={{ width: rem(160), flexShrink: 0 }}
              />
            </Stack>

            <TextField
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              fullWidth
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </Paper>

        <Box>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {intl.formatMessage({
              id: 'orders.items',
              defaultMessage: 'Items',
            })}
          </Typography>

          <Paper variant="outlined">
            <Stack divider={<Divider />}>
              {lines.map((line) => (
                <Stack
                  key={line.key}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'flex-start', p: 2 }}
                >
                  <VariantPicker
                    id={`order-line-${line.key}`}
                    label={intl.formatMessage({
                      id: 'inventory.item',
                      defaultMessage: 'Item',
                    })}
                    options={variants.filter(
                      (option) =>
                        !chosen.has(option.id) ||
                        option.id === line.variant?.id,
                    )}
                    loading={!catalogueAnswered}
                    failed={catalogueFailed}
                    task={direction ?? undefined}
                    value={line.variant?.id ?? ''}
                    onChange={(variantId) =>
                      updateLine(line.key, {
                        variant:
                          variants.find((option) => option.id === variantId) ??
                          null,
                      })
                    }
                  />

                  <TextField
                    label={intl.formatMessage({
                      id: 'inventory.quantity',
                      defaultMessage: 'Quantity',
                    })}
                    value={line.quantityOrdered}
                    onChange={(event) =>
                      updateLine(line.key, {
                        quantityOrdered: event.target.value,
                      })
                    }
                    // Text, not number. A number input coerces through a
                    // double and strips a trailing zero that matters in a
                    // unit of measure.
                    helperText={
                      line.variant
                        ? unitLabel(line.variant.unitOfMeasure, intl)
                        : BLANK_LINE
                    }
                    sx={{ width: rem(140) }}
                  />

                  <TextField
                    label={intl.formatMessage({
                      id: 'orders.unitPrice',
                      defaultMessage: 'Unit price',
                    })}
                    value={line.unitPrice}
                    disabled={!currency}
                    onChange={(event) =>
                      updateLine(line.key, { unitPrice: event.target.value })
                    }
                    helperText={
                      currency ||
                      intl.formatMessage({
                        id: 'orders.create.currencyFirst',
                        defaultMessage: 'Set a currency first',
                      })
                    }
                    sx={{ width: rem(140) }}
                    slotProps={{
                      htmlInput: { inputMode: 'decimal', maxLength: 19 },
                    }}
                  />

                  <IconButton
                    aria-label={intl.formatMessage({
                      id: 'orders.create.removeItem',
                      defaultMessage: 'Remove item',
                    })}
                    disabled={lines.length === 1}
                    onClick={() => removeLine(line.key)}
                    sx={{ mt: 1 }}
                  >
                    <Delete />
                  </IconButton>
                </Stack>
              ))}
            </Stack>

            <Box sx={{ p: 2 }}>
              <Button
                variant="text"
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                {intl.formatMessage({
                  id: 'orders.create.addItem',
                  defaultMessage: 'Add another item',
                })}
              </Button>
            </Box>
          </Paper>
        </Box>

        <Stack direction="row" spacing={2}>
          <Button
            variant="text"
            disabled={submitting}
            // Cancel means discard; it does not ask again. Filled from
            // Reorder points, back there, with what was chosen (ADR-085).
            onClick={() => {
              release();
              void (fill ? navigate(-1) : navigate('/orders'));
            }}
          >
            {intl.formatMessage({
              id: 'common.cancel',
              defaultMessage: 'Cancel',
            })}
          </Button>

          {/* Created as a draft. Confirming is a separate decision, made on
              the order itself — and nothing can be received against a draft
              (ADR-027). */}
          <Button type="submit" disabled={!canSubmit}>
            {submitting
              ? intl.formatMessage({
                  id: 'orders.create.raising',
                  defaultMessage: 'Raising…',
                })
              : intl.formatMessage({
                  id: 'orders.create.raiseAsDraft',
                  defaultMessage: 'Raise as draft',
                })}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
