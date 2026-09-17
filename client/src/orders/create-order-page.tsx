import { Delete } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { OrderDirection, Partner, VariantOption } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [direction, setDirection] = useState<OrderDirection>('purchase');
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

  const { submitting, error, submit } = useSubmit(() => {
    // Nothing to reset — the page unmounts on success.
  });

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
        if (!ignore) setLoadError('Could not load partners and products.');
      });

    return () => {
      ignore = true;
    };
  }, []);

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

    void submit(async () => {
      const created = await api<{ order: { id: string } }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          partnerId: partner.id,
          direction,
          reference: reference || undefined,
          // A date input yields YYYY-MM-DD, which IsISO8601 accepts. Sent as
          // typed rather than converted: expected_at is a calendar day
          // somebody chose, and building a Date here would pin it to this
          // browser's midnight.
          expectedAt: expectedAt || undefined,
          note: note || undefined,
          /**
           * Quantities and prices stay strings from the input to the column. A
           * JSON number has already been through a double before any validator
           * sees it (ADR-025), and 2.75 kg of raw material is ordinary — as is a
           * price like 0.0125.
           */
          lines: complete.map((line) => ({
            variantId: line.variant!.id,
            quantityOrdered: line.quantityOrdered.trim(),
            // Both or neither: the server refuses half a price, and a blank
            // field means this line simply has none yet.
            unitPrice: line.unitPrice.trim() || undefined,
            currency: line.unitPrice.trim() ? currency : undefined,
          })),
        }),
      });

      navigate(`/orders/${created.order.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        <Typography variant="h5" component="h1">
          Raise an order
        </Typography>

        {loadError && <Alert severity="error">{loadError}</Alert>}
        {error && <FormError message={error} />}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Autocomplete
              options={selectablePartners}
              getOptionLabel={(option) =>
                option.code ? `${option.name} (${option.code})` : option.name
              }
              value={partner}
              onChange={(_event, value) => setPartner(value)}
              renderInput={(params) => (
                <TextField {...params} label="Partner" required />
              )}
            />

            <TextField
              select
              label="Direction"
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as OrderDirection)
              }
              // Which way the goods go. A column and not a table (ADR-027):
              // two values the service branches on, carrying no attributes.
              helperText={
                direction === 'purchase'
                  ? 'Stock arrives, and is received against this order.'
                  : 'Stock leaves. Receiving does not apply to a sale.'
              }
            >
              <MenuItem value="purchase">Buying from them</MenuItem>
              <MenuItem value="sale">Selling to them</MenuItem>
            </TextField>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Their reference"
                fullWidth
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                helperText="Their number for this order, not ours. Optional."
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />

              <TextField
                label="Expected"
                type="date"
                fullWidth
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <TextField
                id="order-currency"
                label="Currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
                helperText="For any prices below"
                sx={{ width: 160, flexShrink: 0 }}
                slotProps={{ htmlInput: { maxLength: 3 } }}
              />
            </Stack>

            <TextField
              label="Note"
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
            Items
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
                      <TextField {...params} label="Item" />
                    )}
                  />

                  <TextField
                    label="Quantity"
                    value={line.quantityOrdered}
                    onChange={(event) =>
                      updateLine(line.key, {
                        quantityOrdered: event.target.value,
                      })
                    }
                    // Text, not number. A number input coerces through a
                    // double and strips a trailing zero that matters in a
                    // unit of measure.
                    helperText={line.variant?.unitOfMeasure ?? ' '}
                    sx={{ width: 140 }}
                  />

                  <TextField
                    label="Unit price"
                    value={line.unitPrice}
                    disabled={!currency}
                    onChange={(event) =>
                      updateLine(line.key, { unitPrice: event.target.value })
                    }
                    helperText={currency || 'Set a currency first'}
                    sx={{ width: 140 }}
                    slotProps={{
                      htmlInput: { inputMode: 'decimal', maxLength: 19 },
                    }}
                  />

                  <IconButton
                    aria-label="Remove item"
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
                Add another item
              </Button>
            </Box>
          </Paper>
        </Box>

        <Stack direction="row" spacing={2}>
          <Button
            variant="text"
            disabled={submitting}
            onClick={() => void navigate('/orders')}
          >
            Cancel
          </Button>

          {/* Created as a draft. Confirming is a separate decision, made on
              the order itself — and nothing can be received against a draft
              (ADR-027). */}
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? 'Raising…' : 'Raise as draft'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
