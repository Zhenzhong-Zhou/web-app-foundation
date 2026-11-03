import {
  Alert,
  Box,
  Button,
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

import type {
  Bom,
  Location,
  ProductionRun,
  RunPreview,
  RunPreviewLine,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { PartnerPicker } from '../components/partner-picker';
import { VariantPicker } from '../components/variant-picker';
import { api, withQuery } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  itemName,
  toApiDecimal,
} from '../lib/format';
import { usePartners } from '../lib/use-partners';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';
import { displayWithUnit } from '../products/units';

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
 *
 * The contract manufacturers are partners, which Production may not see
 * (ADR-080): they are asked for only by whoever may, and otherwise the
 * field says why the run is planned as made here.
 */
export function CreateRunDialog({
  open,
  canSeePartners,
  filled,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** partners.view, from the page. */
  canSeePartners: boolean;
  /**
   * Filled in from Reorder points (ADR-085): the item, the quantity to
   * make as a field shows it, and a note saying where they came from. The
   * recipe follows the item; the place is left to choose.
   */
  filled?: { outputVariantId: string; quantityPlanned: string; note: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(() =>
    filled
      ? {
          ...EMPTY,
          outputVariantId: filled.outputVariantId,
          quantityPlanned: filled.quantityPlanned,
        }
      : EMPTY,
  );
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const { variants, answered, failed } = useVariants(open);
  const [locations, setLocations] = useState<Location[]>([]);
  const { partners, answered: partnersAnswered } = usePartners(
    open && canSeePartners,
  );
  // Retired partners are left out, as on New order and a sample's Given
  // to: a new run with a partner you no longer deal with is a mistake
  // worth not offering (#304).
  const manufacturers = partners.filter((partner) => partner.isActive);
  // The item's recipes as their read answered: the rows, or null when it
  // failed. Kept with the item they answer, so until this item's come, no
  // other item's are taken for them (#290).
  const [recipes, setRecipes] = useState<{
    variantId: string;
    rows: Bom[] | null;
  } | null>(null);
  // A count that reads the item's recipes again: Try again, beside the
  // words of a failed read, as New order reads its catalogue again.
  // Choosing the same item again changes nothing, so it was the only way
  // out but clearing the item.
  const [recipeReads, setRecipeReads] = useState(0);
  // Waiting, answered or failed, as useVariants says it for the catalogue.
  const recipesRead =
    form.outputVariantId && recipes?.variantId === form.outputVariantId
      ? recipes
      : null;
  const recipesWaiting = !!form.outputVariantId && !recipesRead;
  const recipesFailed = recipesRead?.rows === null;
  const boms = recipesRead?.rows ?? [];

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
  // location created a moment ago is exactly the one someone is here to use
  // (the variants and partners through their hooks, above).
  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void api<Location[]>('/locations')
      .then((locationRows) => {
        if (!ignore) setLocations(locationRows);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open]);

  // Recipes for whatever is being made. Refetched per variant, because a BOM
  // outputs one variant and offering another product's would be nonsense.
  useEffect(() => {
    const variantId = form.outputVariantId;
    if (!variantId) return;

    let ignore = false;

    void api<Bom[]>(`/boms?outputVariantId=${variantId}`)
      .then((rows) => {
        if (ignore) return;

        const usable = rows.filter((row) => row.status !== 'draft');
        setRecipes({ variantId, rows: usable });
      })
      .catch(() => {
        if (!ignore) setRecipes({ variantId, rows: null });
      });

    return () => {
      ignore = true;
    };
  }, [form.outputVariantId, recipeReads]);

  function close() {
    setForm(EMPTY);
    setRecipes(null);
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

  /**
   * What the run would use at the quantity typed (ADR-085), scaled by the
   * server as release will issue it; the client adds nothing up (ADR-025).
   * Asked once typing pauses; an answer to an older question is dropped
   * by the effect's own cleanup. The last answer stays, dimmed, while the
   * next is asked; a quantity the server refuses shows none.
   */
  const recipe = form.bomId || active?.id || '';
  const planned = toApiDecimal(form.quantityPlanned);
  const usesPath =
    recipe && planned
      ? withQuery('/production-orders/preview', {
          bomId: recipe,
          quantityPlanned: planned,
        })
      : null;
  const [uses, setUses] = useState<{
    path: string;
    lines: RunPreviewLine[] | null;
  } | null>(null);

  useEffect(() => {
    if (!usesPath) return;
    let ignore = false;
    const timer = setTimeout(() => {
      void api<RunPreview>(usesPath)
        .then((result) => {
          if (!ignore) setUses({ path: usesPath, lines: result.lines });
        })
        .catch(() => {
          if (!ignore) setUses({ path: usesPath, lines: null });
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [usesPath]);

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
            {filled && <Alert severity="info">{filled.note}</Alert>}

            {error && <FormError message={error} />}

            {/* As Receive says it: the picker is empty because the read
                failed, not the catalogue (#303). */}
            {failed && (
              <FormError
                message={intl.formatMessage({
                  id: 'inventory.catalogueFailed',
                  defaultMessage: 'Could not load the catalogue.',
                })}
              />
            )}

            <VariantPicker
              id="run-output"
              label={intl.formatMessage({
                id: 'production.making',
                defaultMessage: 'Making',
              })}
              required
              options={variants}
              loading={!answered}
              failed={failed}
              value={form.outputVariantId}
              onChange={(outputVariantId) =>
                setForm((current) => ({
                  ...current,
                  outputVariantId,
                  bomId: '',
                }))
              }
            />

            {/* Said in words, and Plan run stays off: never a run planned
                without the recipe it would have had, silently (#290). */}
            {recipesFailed && (
              <FormError
                id="run-recipes-failed"
                message={intl.formatMessage({
                  id: 'production.create.recipesFailed',
                  defaultMessage: 'Could not load the item’s recipes.',
                })}
                action={
                  <Button
                    variant="text"
                    color="inherit"
                    onClick={() => {
                      // Waiting again, so the words go while it is asked.
                      setRecipes(null);
                      setRecipeReads((count) => count + 1);
                    }}
                  >
                    {intl.formatMessage({
                      id: 'common.tryAgain',
                      defaultMessage: 'Try again',
                    })}
                  </Button>
                }
              />
            )}

            {recipesRead?.rows?.length === 0 && (
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
                  'A batch number or the maker’s works order. Optional.',
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

            {usesPath && uses?.lines?.length ? (
              <Uses lines={uses.lines} current={uses.path === usesPath} />
            ) : null}

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

            {/* We make it ourselves is a row of its own, and the field's
                value until a manufacturer is chosen (#274). */}
            <PartnerPicker
              id="run-partner"
              label={intl.formatMessage({
                id: 'production.contract',
                defaultMessage: 'Contract manufacturer',
              })}
              options={manufacturers}
              loading={canSeePartners && !partnersAnswered}
              none={intl.formatMessage({
                id: 'production.create.ourselves',
                defaultMessage: 'We make it ourselves',
              })}
              value={form.partnerId}
              onChange={(partnerId) =>
                setForm((current) => ({ ...current, partnerId }))
              }
              disabled={!canSeePartners}
              helperText={
                canSeePartners
                  ? undefined
                  : intl.formatMessage({
                      id: 'production.create.partnersUnreadable',
                      defaultMessage:
                        'You can’t see customers and suppliers, so a contract manufacturer can’t be chosen here.',
                    })
              }
            />

            {/* The distinction people get wrong: a manufacturer who buys every
                input and delivers finished goods is a purchase order, not a
                run — nothing of ours was consumed (ADR-030). */}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage({
                id: 'production.create.manufacturerNote',
                defaultMessage:
                  'Only set a manufacturer when we supply some of the components. If they buy everything and deliver finished goods, that is a purchase order.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        {/* Off until the item's recipes have answered, so the run is
            planned with the recipe the select shows: pressed before, it
            went without one (#290). */}
        <DialogFooter
          submitting={submitting}
          onCancel={close}
          disabled={recipesWaiting || recipesFailed}
          describedBy={recipesFailed ? 'run-recipes-failed' : undefined}
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

/**
 * What the run would use, a line per component at the quantity typed, as
 * the server scaled it (ADR-085). Dimmed while a newer quantity is asked.
 */
function Uses({
  lines,
  current,
}: {
  lines: RunPreviewLine[];
  /** Whether it answers the quantity as it is now. */
  current: boolean;
}) {
  const intl = useIntl();

  return (
    <Box
      component="section"
      aria-labelledby="run-uses"
      aria-busy={!current}
      sx={{ opacity: current ? 1 : 0.6 }}
    >
      <Typography id="run-uses" variant="body2" sx={{ fontWeight: 600 }}>
        {intl.formatMessage({
          id: 'production.create.uses',
          defaultMessage: 'Uses',
        })}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {lines.map((line) => (
          <Typography
            key={line.componentVariantId}
            component="li"
            variant="body2"
          >
            {intl.formatMessage(
              {
                id: 'production.create.usesLine',
                defaultMessage:
                  '{quantity} · {sku} {name}{external, select, true { · the maker supplies it} other {}}',
              },
              {
                quantity: displayWithUnit(
                  line.quantity,
                  line.unitOfMeasure,
                  intl,
                ),
                sku: line.sku,
                name: itemName(line.productName, line.variantName),
                external: String(line.supplyType === 'external'),
              },
            )}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
