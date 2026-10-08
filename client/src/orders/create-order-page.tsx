import { Delete } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { CurrencyField } from '../components/currency-field';
import { FormError } from '../components/form-error';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import { api } from '../lib/api';
import {
  BLANK_LINE,
  groupedNumberMessage,
  nameAndCode,
  toApiDecimal,
} from '../lib/format';
import type { OrderDirection, Partner, VariantOption } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { useUnsavedChanges } from '../lib/use-unsaved-changes';
import { unitLabel } from '../products/units';

interface LineDraft {
  /** Local only — React needs a stable key before the row has a variant. */
  key: string;
  variant: VariantOption | null;
  quantityOrdered: string;
  unitPrice: string;
}

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

  const [partners, setPartners] = useState<Partner[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const intl = useIntl();
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set when a quantity or price is typed with a thousands separator.
  const [numberError, setNumberError] = useState<string | null>(null);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [direction, setDirection] = useState<OrderDirection>('purchase');
  const [isSample, setIsSample] = useState(false);
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

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

  useEffect(() => {
    let ignore = false;

    void Promise.all([
      api<Partner[]>('/partners'),
      api<VariantOption[]>('/products/variants'),
    ])
      .then(([partnerRows, variantRows]) => {
        if (ignore) return;
        setPartners(partnerRows);
        setVariants(variantRows);
      })
      .catch(() => {
        if (!ignore) {
          setLoadError(
            intl.formatMessage({
              id: 'orders.create.loadFailed',
              defaultMessage: 'Could not load partners and products.',
            }),
          );
        }
      });

    return () => {
      ignore = true;
    };
    // intl only words the error; a new language refetches, which is harmless.
  }, [intl]);

  /**
   * Retired partners are filtered out here and nowhere else.
   *
   * The directory lists them, because a name that vanished is harder to
   * explain than one shown as inactive (ADR-026). This is the one place where
   * choosing one would be a mistake — the server refuses it with a 409, and
   * an option that always fails is worse than an option that is absent.
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

      // Saved: on to the order, without asking.
      release();
      navigate(`/orders/${created.order.id}`);
    });
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

        {loadError && <Alert severity="error">{loadError}</Alert>}
        {(numberError ?? error) && (
          <FormError message={(numberError ?? error)!} />
        )}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Autocomplete
              options={selectablePartners}
              getOptionLabel={(option) => nameAndCode(option.name, option.code)}
              value={partner}
              onChange={(_event, value) => setPartner(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({
                    id: 'orders.partner',
                    defaultMessage: 'Partner',
                  })}
                  required
                />
              )}
            />

            <TextField
              select
              label={intl.formatMessage({
                id: 'orders.direction',
                defaultMessage: 'Direction',
              })}
              value={direction}
              onChange={(event) => {
                const next = event.target.value as OrderDirection;
                setDirection(next);
                // A purchase cannot be a sample, so switching away clears it
                // rather than sending a flag the server would refuse.
                if (next === 'purchase') setIsSample(false);
              }}
              // Which way the goods go. A column and not a table (ADR-027):
              // two values the service branches on, carrying no attributes.
              helperText={
                direction === 'purchase'
                  ? intl.formatMessage({
                      id: 'orders.direction.purchase.help',
                      defaultMessage:
                        'Stock arrives, and is received against this order.',
                    })
                  : intl.formatMessage({
                      id: 'orders.direction.sale.help',
                      defaultMessage:
                        'Stock leaves. Receiving does not apply to a sale.',
                    })
              }
            >
              <MenuItem value="purchase">
                {intl.formatMessage({
                  id: 'orders.direction.purchase',
                  defaultMessage: 'Buying from them',
                })}
              </MenuItem>
              <MenuItem value="sale">
                {intl.formatMessage({
                  id: 'orders.direction.sale',
                  defaultMessage: 'Selling to them',
                })}
              </MenuItem>
            </TextField>

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
                sx={{ width: 160, flexShrink: 0 }}
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
                  <Autocomplete
                    sx={{ flexGrow: 1 }}
                    options={variants.filter(
                      (option) =>
                        !chosen.has(option.id) ||
                        option.id === line.variant?.id,
                    )}
                    getOptionLabel={(option) =>
                      `${option.sku} — ${option.productName}`
                    }
                    value={line.variant}
                    onChange={(_event, value) =>
                      updateLine(line.key, { variant: value })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={intl.formatMessage({
                          id: 'inventory.item',
                          defaultMessage: 'Item',
                        })}
                      />
                    )}
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
                    sx={{ width: 140 }}
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
                    sx={{ width: 140 }}
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
            // Cancel means discard; it does not ask again.
            onClick={() => {
              release();
              void navigate('/orders');
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
