import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { api, messageFor } from '../lib/api';
import { formatQuantity, nameAndCode } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { Bom, BomLine, ProductLicence, VariantOption } from '../lib/types';
import { licenceStatus } from '../licences/licence-status';
import { LicenceStatusChip } from '../licences/licence-status-chip';
import type { Variant } from '../products/products-page';
import { AddBomLineDialog } from './add-bom-line-dialog';
import { bomStatusLabel } from './bom-status';
import { CreateBomDialog } from './create-bom-dialog';
import { EditBomLineDialog } from './edit-bom-line-dialog';
import { RecipeLinesTable } from './recipe-lines-table';
import { useRecipe } from './use-recipe';

const STATUS_COLOR = {
  draft: 'default',
  active: 'success',
  archived: 'default',
} as const;

/**
 * Recipes for one variant of this product.
 *
 * Scoped to a variant rather than the product because that is what a BOM
 * outputs (ADR-029): a 60ct and a 120ct are different recipes, and a panel
 * showing both at once would have to explain which lines belong to which.
 *
 * Only drafts are editable. An active recipe changes by duplicating it to a
 * new draft and promoting that, which is why the buttons here differ by
 * status rather than a single Edit that sometimes fails.
 */
export function RecipePanel({ variants }: { variants: Variant[] }) {
  const intl = useIntl();
  const can = useCan();

  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const [catalogue, setCatalogue] = useState<VariantOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<BomLine | null>(null);
  const [licences, setLicences] = useState<ProductLicence[]>([]);

  const canView = can('boms.view');
  const canCreate = can('boms.create');
  const canUpdate = can('boms.update');

  const { versions, selected, error, setError, load } = useRecipe(
    variantId,
    canView,
  );

  /**
   * The catalogue: labels for the lines, and choices for the picker. Lines
   * store the id, because a SKU is editable and a recipe displaying a stale
   * one would be worse than showing none.
   *
   * Refetched whenever the add dialog opens, not once on mount. The stale case
   * is the one that matters — a component variant created a moment ago, to be
   * put on this recipe now — and it is the same reasoning ReceiveStockDialog
   * loads its catalogue on open.
   */
  /**
   * The licences this recipe could be registered under. Fetched whether or
   * not any exist: for an unregulated product the list is empty and the field
   * never appears, which is the right answer rather than a setting to turn
   * off.
   */
  useEffect(() => {
    if (!canView) return;

    let ignore = false;

    void api<ProductLicence[]>('/product-licences')
      .then((rows) => {
        if (!ignore) setLicences(rows);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [canView]);

  useEffect(() => {
    if (!canView) return;

    let ignore = false;

    void api<VariantOption[]>('/products/variants')
      .then((rows) => {
        if (!ignore) setCatalogue(rows);
      })
      .catch(() => {
        // A failed catalogue costs labels, not function. The lines still
        // render, and the error banner is reserved for the recipe itself.
      });

    return () => {
      ignore = true;
    };
  }, [canView, addingLine]);

  async function act(
    path: string,
    options: { method: string; preferId?: string; body?: unknown },
  ) {
    setBusy(true);
    setError(null);

    try {
      await api(path, {
        method: options.method,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      await load(options.preferId);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!selected) return;

    setBusy(true);
    setError(null);

    try {
      const { bom } = await api<{ bom: Bom }>(
        `/boms/${selected.id}/duplicate`,
        {
          method: 'POST',
        },
      );
      await load(bom.id);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!selected) return;

    setBusy(true);
    setError(null);

    try {
      await api(`/boms/${selected.id}/lines/${lineId}`, { method: 'DELETE' });
      await load(selected.id);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  const isDraft = selected?.status === 'draft';

  function labelFor(componentVariantId: string): string {
    const match = catalogue.find((row) => row.id === componentVariantId);
    if (!match) return componentVariantId;

    return match.variantName
      ? [match.sku, match.variantName].join(' — ')
      : match.sku;
  }

  /** The licence the selected version is made under, for its status chip. */
  const selectedLicence = selected?.licenceId
    ? licences.find((row) => row.id === selected.licenceId)
    : undefined;

  /** "NPN 80012345 (Health Canada)", or null when the recipe carries none. */
  function licenceFor(licenceId: string | null): string | null {
    if (!licenceId) return null;

    const licence = licences.find((row) => row.id === licenceId);
    if (!licence) return null;

    return nameAndCode(licence.number, licence.authority);
  }

  function unitFor(componentVariantId: string): string {
    return (
      catalogue.find((row) => row.id === componentVariantId)?.unitOfMeasure ??
      ''
    );
  }

  return (
    <Stack spacing={2}>
      {/* Wraps as whole controls: on a phone the picker and the button drop
          under the heading together rather than squeezing it. */}
      <Stack
        direction="row"
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}
      >
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'production.recipe',
            defaultMessage: 'Recipe',
          })}
        </Typography>

        {variants.length > 1 && (
          <TextField
            id="recipe-variant"
            label={intl.formatMessage({
              id: 'boms.for',
              defaultMessage: 'For',
            })}
            select
            size="small"
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            {variants.map((variant) => (
              <MenuItem key={variant.id} value={variant.id}>
                {variant.name
                  ? [variant.sku, variant.name].join(' — ')
                  : variant.sku}
              </MenuItem>
            ))}
          </TextField>
        )}

        {/* Filled only when there is nothing yet, and then it is the one
            thing to do here. Once a recipe exists, a second one for the same
            variant is rare, and a filled button beside "New version" made two
            primaries compete for the same glance. */}
        {canCreate && (
          <Button
            variant={versions.length === 0 ? 'contained' : 'outlined'}
            onClick={openDialog(() => setCreating(true))}
            disabled={busy}
          >
            {intl.formatMessage({
              id: 'boms.new',
              defaultMessage: 'New recipe',
            })}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {versions.length === 0 && !error && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'boms.empty',
            defaultMessage:
              'No recipe yet. A recipe is what makes a production run one click instead of typing the components every time.',
          })}
        </Alert>
      )}

      {versions.length > 1 && (
        <TextField
          id="recipe-version"
          label={intl.formatMessage({
            id: 'boms.version',
            defaultMessage: 'Version',
          })}
          select
          size="small"
          value={selected?.id ?? ''}
          onChange={(event) => void load(event.target.value)}
          sx={{ maxWidth: 260 }}
        >
          {versions.map((version) => (
            <MenuItem key={version.id} value={version.id}>
              {intl.formatMessage(
                {
                  id: 'boms.versionOption',
                  defaultMessage: 'v{version} — {status}',
                },
                {
                  version: version.version,
                  status: bomStatusLabel(version.status),
                },
              )}
            </MenuItem>
          ))}
        </TextField>
      )}

      {selected && (
        <>
          {/*
           * Two groups, not one row of five things. The summary takes what
           * space is left but never less than ~320px; below that the actions
           * move as a block to their own line, right-aligned. Before, every
           * item shrank at once — the sentence wrapped to two lines and the
           * button labels broke — so the row changed shape at every width.
           */}
          <Stack
            direction="row"
            useFlexGap
            sx={{
              alignItems: 'center',
              flexWrap: 'wrap',
              columnGap: 2,
              rowGap: 1,
            }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', flex: '1 1 320px', minWidth: 0 }}
            >
              <Chip
                label={bomStatusLabel(selected.status)}
                size="small"
                color={STATUS_COLOR[selected.status]}
              />

              <Typography variant="body2" color="text.secondary">
                {licenceFor(selected.licenceId)
                  ? intl.formatMessage(
                      {
                        id: 'boms.makesUnder',
                        defaultMessage:
                          'Makes {quantity} per batch · made under {licence}',
                      },
                      {
                        quantity: formatQuantity(selected.outputQuantity),
                        licence: licenceFor(selected.licenceId),
                      },
                    )
                  : intl.formatMessage(
                      {
                        id: 'boms.makes',
                        defaultMessage: 'Makes {quantity} per batch',
                      },
                      { quantity: formatQuantity(selected.outputQuantity) },
                    )}
              </Typography>

              {/* Seen here, before a run is planned, rather than first at
                  release, which refuses or asks for an override (ADR-050). */}
              {selectedLicence && (
                <LicenceStatusChip licence={selectedLicence} />
              )}
            </Stack>

            {/* Least to most committal, left to right, so the one filled
                button — the thing this status is waiting for — sits at the
                end of the reading line. Everything else is text weight. */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', ml: 'auto' }}
            >
              {/* Per version, not per product: a product with twenty versions
                  would bury "discontinued" under a hundred recipe edits, and
                  the question here is always about this recipe. */}
              <HistoryButton resourceId={selected.id} />

              {canUpdate && selected.status === 'active' && (
                <Button
                  variant="text"
                  disabled={busy}
                  onClick={() =>
                    void act(`/boms/${selected.id}/archive`, {
                      method: 'POST',
                      preferId: selected.id,
                    })
                  }
                >
                  {intl.formatMessage({
                    id: 'boms.archive',
                    defaultMessage: 'Archive',
                  })}
                </Button>
              )}

              {canUpdate && isDraft && (
                <Button
                  variant="text"
                  disabled={busy}
                  onClick={openDialog(() => setAddingLine(true))}
                >
                  {intl.formatMessage({
                    id: 'boms.line.add',
                    defaultMessage: 'Add component',
                  })}
                </Button>
              )}

              {canCreate && !isDraft && (
                <Tooltip
                  title={intl.formatMessage({
                    id: 'boms.newVersion.tooltip',
                    defaultMessage:
                      'An active recipe cannot be edited — this copies it to a new draft',
                  })}
                >
                  <span>
                    <Button disabled={busy} onClick={() => void duplicate()}>
                      {intl.formatMessage({
                        id: 'boms.newVersion',
                        defaultMessage: 'New version',
                      })}
                    </Button>
                  </span>
                </Tooltip>
              )}

              {canUpdate && isDraft && (
                <Tooltip
                  title={intl.formatMessage({
                    id: 'boms.promote.tooltip',
                    defaultMessage:
                      'Makes this the recipe new runs use, and archives the current one',
                  })}
                >
                  <span>
                    <Button
                      disabled={busy || selected.lines.length === 0}
                      onClick={() =>
                        void act(`/boms/${selected.id}/promote`, {
                          method: 'POST',
                          preferId: selected.id,
                        })
                      }
                    >
                      {intl.formatMessage({
                        id: 'boms.promote',
                        defaultMessage: 'Promote',
                      })}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
          </Stack>

          {/* A promoted recipe is frozen except for this, and only until a
              run is made against it: the NPN often lands weeks after the
              formulation is settled, and a version identical but for a
              number would be a fiction in the history (ADR-029). */}
          {canUpdate && !selected.licenceLocked && licences.length > 0 && (
            <TextField
              id="recipe-licence"
              label={intl.formatMessage({
                id: 'boms.licence',
                defaultMessage: 'Licence',
              })}
              select
              size="small"
              value={selected.licenceId ?? ''}
              /*
               * Not disabled while the request runs. MUI hides the open menu
               * with aria-hidden as it closes, and disabling the field in the
               * same tick strands focus on the item just clicked — which the
               * browser blocks and reports. Guarding on busy refuses a second
               * change without touching focus.
               */
              onChange={(event) => {
                if (busy) return;

                void act(`/boms/${selected.id}`, {
                  method: 'PATCH',
                  preferId: selected.id,
                  body: { licenceId: event.target.value || null },
                });
              }}
              sx={{ maxWidth: 360 }}
              helperText={
                isDraft
                  ? intl.formatMessage({
                      id: 'boms.licence.help',
                      defaultMessage:
                        'What this formulation is registered under.',
                    })
                  : intl.formatMessage({
                      id: 'boms.licence.stillChangeable',
                      defaultMessage:
                        'Still changeable: nothing has been made against this version yet.',
                    })
              }
            >
              <MenuItem value="">
                {intl.formatMessage({
                  id: 'boms.licence.none',
                  defaultMessage: 'Not registered',
                })}
              </MenuItem>
              {licences
                .filter(
                  (licence) =>
                    licenceStatus(licence).usable ||
                    licence.id === selected.licenceId,
                )
                .map((licence) => (
                  <MenuItem key={licence.id} value={licence.id}>
                    {[licence.number, licence.authority].join(' — ')}
                  </MenuItem>
                ))}
            </TextField>
          )}

          {isDraft && selected.lines.length === 0 && (
            <Alert severity="info">
              {intl.formatMessage({
                id: 'boms.noComponents',
                defaultMessage:
                  'A recipe with no components cannot be promoted — it would make stock appear from nothing.',
              })}
            </Alert>
          )}

          <RecipeLinesTable
            lines={selected.lines}
            labelFor={labelFor}
            unitFor={unitFor}
            editable={canUpdate && isDraft}
            busy={busy}
            onEdit={setEditingLine}
            onRemove={(lineId) => void removeLine(lineId)}
          />
        </>
      )}

      <CreateBomDialog
        open={creating}
        outputVariantId={variantId}
        onClose={() => setCreating(false)}
        onCreated={(bomId) => load(bomId)}
      />

      <AddBomLineDialog
        open={addingLine}
        bomId={selected?.id ?? null}
        catalogue={catalogue}
        excludeVariantIds={[
          variantId,
          ...(selected?.lines ?? []).map((line) => line.componentVariantId),
        ]}
        onClose={() => setAddingLine(false)}
        onAdded={() => load(selected?.id)}
      />

      {/* Keyed on the line so switching rows remounts rather than syncing
          state in an effect — the fields then initialise from props. */}
      <EditBomLineDialog
        key={editingLine?.id ?? 'no-line'}
        open={editingLine !== null}
        bomId={selected?.id ?? null}
        line={editingLine}
        onClose={() => setEditingLine(null)}
        onSaved={() => load(selected?.id)}
      />
    </Stack>
  );
}
