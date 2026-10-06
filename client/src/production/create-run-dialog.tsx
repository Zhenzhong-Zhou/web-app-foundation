import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import type {
  Bom,
  Location,
  Partner,
  ProductionRun,
  VariantOption,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';

const EMPTY = {
  outputVariantId: '',
  bomId: '',
  locationId: '',
  partnerId: '',
  quantityPlanned: '',
  reference: '',
};

/**
 * Plans a run. Nothing moves until it is released.
 *
 * The recipe is chosen here rather than at release, because the batch size
 * only means something against a yield — "500" is half a batch of a recipe
 * that makes 1000, and a quarter of one that makes 2000.
 */
export function CreateRunDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);

  const { submitting, error, reset, submit } = useSubmit(
    () => {
      close();
      onCreated();
    },
    {
      success: intl.formatMessage({
        id: 'production.planned',
        defaultMessage: 'Run planned',
      }),
    },
  );

  // Loaded when the dialog opens rather than at page load: a variant or a
  // location created a moment ago is exactly the one someone is here to use.
  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void Promise.all([
      api<VariantOption[]>('/products/variants'),
      api<Location[]>('/locations'),
      api<Partner[]>('/partners'),
    ])
      .then(([variantRows, locationRows, partnerRows]) => {
        if (ignore) return;
        setVariants(variantRows);
        setLocations(locationRows);
        setPartners(partnerRows);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open]);

  // Recipes for whatever is being made. Refetched per variant, because a BOM
  // outputs one variant and offering another product's would be nonsense.
  useEffect(() => {
    if (!form.outputVariantId) return;

    let ignore = false;

    void api<Bom[]>(`/boms?outputVariantId=${form.outputVariantId}`)
      .then((rows) => {
        if (ignore) return;

        const usable = rows.filter((row) => row.status !== 'draft');
        setBoms(usable);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [form.outputVariantId]);

  function close() {
    setForm(EMPTY);
    setBoms([]);
    setQuantityError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const quantityPlanned = toApiDecimal(form.quantityPlanned);
    if (quantityPlanned === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api<{ productionOrder: ProductionRun }>('/production-orders', {
        method: 'POST',
        body: JSON.stringify({
          outputVariantId: form.outputVariantId,
          // The recipe the select is showing. It displays the active one
          // until someone picks another, and sending only form.bomId meant an
          // untouched select planned the run with no recipe at all — which
          // release then refused.
          bomId:
            form.bomId ||
            boms.find((row) => row.status === 'active')?.id ||
            undefined,
          locationId: form.locationId,
          partnerId: form.partnerId || undefined,
          // The string as typed, its decimal separator made a point.
          // Number() here would undo numeric(18, 4).
          quantityPlanned,
          reference: form.reference || undefined,
        }),
      }),
    );
  }

  const active = boms.find((row) => row.status === 'active');

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'production.plan',
            defaultMessage: 'Plan a run',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <VariantPicker
              id="run-output"
              label={intl.formatMessage({
                id: 'production.making',
                defaultMessage: 'Making',
              })}
              required
              options={variants}
              value={form.outputVariantId}
              onChange={(outputVariantId) =>
                setForm((current) => ({
                  ...current,
                  outputVariantId,
                  bomId: '',
                }))
              }
            />

            {form.outputVariantId && boms.length === 0 && (
              <Alert severity="warning">
                {intl.formatMessage({
                  id: 'production.create.noRecipe',
                  defaultMessage:
                    'No promoted recipe for this item. You can still plan the run, but releasing it needs a recipe — there would be nothing to issue.',
                })}
              </Alert>
            )}

            {boms.length > 0 && (
              <TextField
                id="run-bom"
                label={intl.formatMessage({
                  id: 'production.recipe',
                  defaultMessage: 'Recipe',
                })}
                select
                fullWidth
                value={form.bomId || active?.id || ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bomId: event.target.value,
                  }))
                }
                helperText={intl.formatMessage({
                  id: 'production.create.recipe.help',
                  defaultMessage:
                    'An archived version is offered for repeating an old batch.',
                })}
              >
                {boms.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {row.status === 'active'
                      ? intl.formatMessage(
                          {
                            id: 'production.create.recipeCurrent',
                            defaultMessage:
                              'v{version} (current) — makes {quantity}',
                          },
                          {
                            version: row.version,
                            quantity: formatQuantity(row.outputQuantity),
                          },
                        )
                      : intl.formatMessage(
                          {
                            id: 'production.create.recipeArchived',
                            defaultMessage:
                              'v{version} (archived) — makes {quantity}',
                          },
                          {
                            version: row.version,
                            quantity: formatQuantity(row.outputQuantity),
                          },
                        )}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="run-reference"
              label={intl.formatMessage({
                id: 'orders.reference',
                defaultMessage: 'Reference',
              })}
              fullWidth
              value={form.reference}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reference: event.target.value,
                }))
              }
              helperText={intl.formatMessage({
                id: 'production.create.reference.help',
                defaultMessage:
                  "A batch number or the maker's works order. Optional.",
              })}
            />

            <TextField
              id="run-quantity"
              label={intl.formatMessage({
                id: 'production.create.quantity',
                defaultMessage: 'Quantity to make',
              })}
              required
              fullWidth
              value={form.quantityPlanned}
              onChange={(event) => {
                setQuantityError(null);
                setForm((current) => ({
                  ...current,
                  quantityPlanned: event.target.value,
                }));
              }}
              error={!!quantityError}
              helperText={
                quantityError ??
                (active
                  ? intl.formatMessage(
                      {
                        id: 'production.create.quantity.scales',
                        defaultMessage:
                          'The recipe makes {quantity} per batch — components scale to whatever you enter.',
                      },
                      { quantity: formatQuantity(active.outputQuantity) },
                    )
                  : intl.formatMessage({
                      id: 'production.create.quantity.help',
                      defaultMessage:
                        'How many finished units this run should produce.',
                    }))
              }
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            <TextField
              id="run-location"
              label={intl.formatMessage({
                id: 'production.madeAt',
                defaultMessage: 'Made at',
              })}
              select
              required
              fullWidth
              value={form.locationId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  locationId: event.target.value,
                }))
              }
              helperText={intl.formatMessage({
                id: 'production.create.location.help',
                defaultMessage:
                  'Components are issued here and output is received here.',
              })}
            >
              {locations.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="run-partner"
              label={intl.formatMessage({
                id: 'production.contract',
                defaultMessage: 'Contract manufacturer',
              })}
              select
              fullWidth
              value={form.partnerId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  partnerId: event.target.value,
                }))
              }
            >
              <MenuItem value="">
                {intl.formatMessage({
                  id: 'production.create.ourselves',
                  defaultMessage: 'We make it ourselves',
                })}
              </MenuItem>
              {partners.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name}
                </MenuItem>
              ))}
            </TextField>

            {/* The distinction people get wrong: a manufacturer who buys every
                input and delivers finished goods is a purchase order, not a
                run — nothing of ours was consumed (ADR-030). */}
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'production.create.manufacturerNote',
                defaultMessage:
                  'Only set a manufacturer when we supply some of the components. If they buy everything and deliver finished goods, that is a purchase order.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'production.create.action',
            defaultMessage: 'Plan run',
          })}
          pendingLabel={intl.formatMessage({
            id: 'production.create.pending',
            defaultMessage: 'Planning…',
          })}
        />
      </form>
    </Dialog>
  );
}
