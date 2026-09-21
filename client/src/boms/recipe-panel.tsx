import {
  Alert,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { Bom, BomDetail, BomLine, VariantOption } from '../lib/types';
import type { Variant } from '../products/products-page';
import { AddBomLineDialog } from './add-bom-line-dialog';
import { CreateBomDialog } from './create-bom-dialog';
import { EditBomLineDialog } from './edit-bom-line-dialog';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

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
  const { session } = useAuth();

  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [versions, setVersions] = useState<Bom[]>([]);
  const [selected, setSelected] = useState<BomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catalogue, setCatalogue] = useState<VariantOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<BomLine | null>(null);

  const canView = session?.permissions.includes('boms.view') ?? false;
  const canCreate = session?.permissions.includes('boms.create') ?? false;
  const canUpdate = session?.permissions.includes('boms.update') ?? false;

  const load = useCallback(
    async (preferId?: string) => {
      if (!variantId) return;

      const rows = await api<Bom[]>(`/boms?outputVariantId=${variantId}`);
      setVersions(rows);

      // Prefer what the caller just acted on, then the active version, then
      // the newest — so promoting or duplicating leaves you looking at the
      // thing you changed rather than jumping elsewhere.
      const pick =
        rows.find((row) => row.id === preferId) ??
        rows.find((row) => row.status === 'active') ??
        rows[0];

      setSelected(pick ? await api<BomDetail>(`/boms/${pick.id}`) : null);
      setError(null);
    },
    [variantId],
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

  /**
   * Fetched inline rather than through `load`, which stays for the refresh
   * after an action. Two reasons, and the second is the real one: setState
   * reached synchronously from an effect body triggers cascading renders, and
   * `load` writes state without knowing whether its variant is still the
   * selected one — switching variants mid-flight could land the previous
   * recipe. Everything here is guarded by `ignore` after the last await.
   */
  useEffect(() => {
    if (!canView || !variantId) return;

    let ignore = false;

    void (async () => {
      try {
        const rows = await api<Bom[]>(`/boms?outputVariantId=${variantId}`);
        const pick =
          rows.find((row) => row.status === 'active') ?? rows[0] ?? null;
        const detail = pick ? await api<BomDetail>(`/boms/${pick.id}`) : null;

        if (ignore) return;

        setVersions(rows);
        setSelected(detail);
        setError(null);
      } catch (caught) {
        if (!ignore) setError(messageFor(caught));
      }
    })();

    return () => {
      ignore = true;
    };
  }, [canView, variantId]);

  async function act(
    path: string,
    options: { method: string; preferId?: string },
  ) {
    setBusy(true);
    setError(null);

    try {
      await api(path, { method: options.method });
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
      ? `${match.sku} — ${match.variantName}`
      : match.sku;
  }

  function unitFor(componentVariantId: string): string {
    return (
      catalogue.find((row) => row.id === componentVariantId)?.unitOfMeasure ??
      ''
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Recipe
        </Typography>

        {variants.length > 1 && (
          <TextField
            id="recipe-variant"
            label="For"
            select
            size="small"
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            {variants.map((variant) => (
              <MenuItem key={variant.id} value={variant.id}>
                {variant.sku}
                {variant.name ? ` — ${variant.name}` : ''}
              </MenuItem>
            ))}
          </TextField>
        )}

        {canCreate && (
          <Button onClick={openDialog(() => setCreating(true))} disabled={busy}>
            New recipe
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {versions.length === 0 && !error && (
        <Alert severity="info">
          No recipe yet. A recipe is what makes a production run one click
          instead of typing the components every time.
        </Alert>
      )}

      {versions.length > 1 && (
        <TextField
          id="recipe-version"
          label="Version"
          select
          size="small"
          value={selected?.id ?? ''}
          onChange={(event) => void load(event.target.value)}
          sx={{ maxWidth: 260 }}
        >
          {versions.map((version) => (
            <MenuItem key={version.id} value={version.id}>
              v{version.version} — {version.status}
            </MenuItem>
          ))}
        </TextField>
      )}

      {selected && (
        <>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Chip
              label={selected.status}
              size="small"
              color={STATUS_COLOR[selected.status]}
            />

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ flexGrow: 1 }}
            >
              Makes {selected.outputQuantity} per batch
            </Typography>

            {canUpdate && isDraft && (
              <Tooltip title="Makes this the recipe new runs use, and archives the current one">
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
                    Promote
                  </Button>
                </span>
              </Tooltip>
            )}

            {canCreate && !isDraft && (
              <Tooltip title="An active recipe cannot be edited — this copies it to a new draft">
                <span>
                  <Button disabled={busy} onClick={() => void duplicate()}>
                    New version
                  </Button>
                </span>
              </Tooltip>
            )}

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
                Archive
              </Button>
            )}

            {canUpdate && isDraft && (
              <Button
                variant="text"
                disabled={busy}
                onClick={openDialog(() => setAddingLine(true))}
              >
                Add component
              </Button>
            )}
          </Stack>

          {isDraft && selected.lines.length === 0 && (
            <Alert severity="info">
              A recipe with no components cannot be promoted — it would make
              stock appear from nothing.
            </Alert>
          )}

          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell align="right">Per batch</TableCell>
                    <TableCell>Supplied by</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {selected.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{labelFor(line.componentVariantId)}</TableCell>
                      <TableCell align="right">
                        {line.quantity} {unitFor(line.componentVariantId)}
                      </TableCell>
                      <TableCell>
                        {line.supplyType === 'external' ? (
                          <Tooltip title="Provided by whoever manufactures — never enters our stock">
                            <Chip label="Manufacturer" size="small" />
                          </Tooltip>
                        ) : (
                          <Chip label="Us" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {canUpdate && isDraft && (
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ justifyContent: 'flex-end' }}
                          >
                            <Button
                              size="small"
                              variant="text"
                              disabled={busy}
                              onClick={openDialog(() => setEditingLine(line))}
                            >
                              Edit
                            </Button>
                            <IconButton
                              size="small"
                              aria-label={`Remove ${labelFor(line.componentVariantId)}`}
                              disabled={busy}
                              onClick={() => void removeLine(line.id)}
                            >
                              ×
                            </IconButton>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
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
