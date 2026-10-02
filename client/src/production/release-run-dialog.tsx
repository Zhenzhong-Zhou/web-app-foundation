import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { fromScaled, sumDecimals, toScaled } from '../lib/decimal';
import { formatDay } from '../lib/format';
import type {
  Bom,
  IssuePlan,
  IssuePlanLine,
  LicenceCheck,
  ProductionRun,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';

interface LocationSummary {
  id: string;
  name: string;
  isAvailable: boolean;
}

/**
 * Release: pick a source, issue the components, freeze the recipe onto the run.
 *
 * One source with per-line overrides rather than a source on every line,
 * because most components do come from the same place and a form repeating the
 * same answer eight times is a form people stop reading (ADR-032).
 */
export function ReleaseRunDialog({
  open,
  run,
  canOverrideLicence,
  onClose,
  onReleased,
}: {
  open: boolean;
  run: ProductionRun;
  /** production.override_licence, from the page (ADR-050). */
  canOverrideLicence: boolean;
  onClose: () => void;
  onReleased: () => Promise<void> | void;
}) {
  const [sourceLocationId, setSource] = useState('');
  const [locations, setLocations] = useState<LocationSummary[]>([]);

  /**
   * A draft planned without a recipe can be given one here, where the need
   * shows up. Release is the step that needs a recipe, and sending somebody
   * back to "attach one first" with no way to do it on this screen was a dead
   * end: the run had no edit form.
   */
  const needsRecipe = run.bomId === null;
  const [recipes, setRecipes] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState('');
  const chosenBom =
    bomId || recipes.find((row) => row.status === 'active')?.id || '';

  /**
   * What release will issue from the chosen source, lot by lot (ADR-039).
   * Shown so the earliest-expiry pick is seen before it happens, and can be
   * replaced for a line when something on the shelf says otherwise — a
   * damaged box, a lot on hold. Not available until the run has a recipe,
   * because there is nothing to plan without one.
   */
  const [plan, setPlan] = useState<IssuePlanLine[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  /**
   * What release will do with the recipe's licence, from the same check
   * release runs (ADR-050), so a refusal is seen before Release is pressed
   * and an override can be given with its reason. Kept across a change of
   * source: the licence belongs to the recipe, not the shelf.
   */
  const [licenceCheck, setLicenceCheck] = useState<LicenceCheck | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const needsOverride = licenceCheck?.outcome === 'override';
  const licenceStops =
    licenceCheck?.outcome === 'block' ||
    (needsOverride && (!canOverrideLicence || !overrideReason.trim()));

  /** Hand-picked quantities per component, keyed by lot id. */
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>(
    {},
  );

  useEffect(() => {
    if (!open || needsRecipe || !sourceLocationId) return;

    let ignore = false;

    void api<IssuePlan>(
      `/production-orders/${run.id}/issue-plan?sourceLocationId=${sourceLocationId}`,
    )
      .then((result) => {
        if (!ignore) {
          setPlan(result.lines);
          setLicenceCheck(result.licenceCheck);
        }
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setPlanError(
            caught instanceof Error ? caught.message : 'Could not load lots.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [open, needsRecipe, sourceLocationId, run.id]);

  const trackedLines = (plan ?? []).filter(
    (line) => line.supplyType === 'stocked' && line.tracksLots,
  );

  /**
   * Every hand-picked line adds up to what it needs. Release waits for it:
   * the server refuses a mismatch anyway, and a button that can only fail is
   * worth not offering. Lines left to earliest expiry have nothing to check.
   */
  const picksMatch = trackedLines.every((line) => {
    const picking = picks[line.componentVariantId];
    if (!picking) return true;

    const total = sumDecimals(Object.values(picking));
    return total !== null && total === toScaled(line.quantity);
  });

  function startPicking(line: IssuePlanLine) {
    setPicks((current) => ({
      ...current,
      [line.componentVariantId]: Object.fromEntries(
        line.lots.map((lot) => [lot.lotId, lot.taken ? lot.take : '']),
      ),
    }));
  }

  function stopPicking(componentVariantId: string) {
    setPicks((current) => {
      const next = { ...current };
      delete next[componentVariantId];
      return next;
    });
  }

  function setPick(componentVariantId: string, lotId: string, value: string) {
    setPicks((current) => ({
      ...current,
      [componentVariantId]: { ...current[componentVariantId], [lotId]: value },
    }));
  }

  useEffect(() => {
    if (!open || !needsRecipe) return;

    let ignore = false;

    void api<Bom[]>(`/boms?outputVariantId=${run.outputVariantId}`)
      .then((rows) => {
        // Drafts are unfinished; the create dialog offers the same set.
        if (!ignore) setRecipes(rows.filter((row) => row.status !== 'draft'));
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open, needsRecipe, run.outputVariantId]);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onReleased();
    },
    { success: 'Run released' },
  );

  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void api<LocationSummary[]>('/locations')
      .then((rows) => {
        // Retained or quarantined stock is not raw material (ADR-042).
        if (!ignore) setLocations(rows.filter((row) => row.isAvailable));
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open]);

  function close() {
    setSource('');
    setBomId('');
    setPlan(null);
    setPlanError(null);
    setPicks({});
    setLicenceCheck(null);
    setOverrideReason('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      // Two requests, not one. Attaching is an edit the server already
      // allows on a draft, and if release then fails the run simply keeps
      // its recipe — a draft with a recipe is what it should have been.
      if (needsRecipe) {
        await api(`/production-orders/${run.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ bomId: chosenBom }),
        });
      }

      // Only lines someone changed. The rest are picked by the server at
      // release time, earliest expiry first, against stock as it is then —
      // not as the preview saw it.
      const lots = Object.entries(picks)
        .map(([componentVariantId, byLot]) => ({
          componentVariantId,
          lots: Object.entries(byLot)
            .filter(([, quantity]) => quantity.trim() !== '')
            .map(([lotId, quantity]) => ({ lotId, quantity: quantity.trim() })),
        }))
        .filter((entry) => entry.lots.length > 0);

      await api(`/production-orders/${run.id}/release`, {
        method: 'POST',
        body: JSON.stringify({
          sourceLocationId,
          lots: lots.length > 0 ? lots : undefined,
          // Only when the check asks for one: sent otherwise, the server
          // would still require the permission (ADR-050).
          licenceOverride: needsOverride
            ? { reason: overrideReason.trim() }
            : undefined,
        }),
      });
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>Release this run</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {needsRecipe && recipes.length === 0 && (
              <Alert severity="warning">
                There is no recipe for this item yet. Create one on the
                product&apos;s page and make it active, then release.
              </Alert>
            )}

            {needsRecipe && recipes.length > 0 && (
              <TextField
                id="release-recipe"
                label="Recipe"
                select
                required
                fullWidth
                value={chosenBom}
                onChange={(event) => setBomId(event.target.value)}
                helperText="This run was planned without one. It is attached before releasing."
              >
                {recipes.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    v{row.version} — {row.status}, makes {row.outputQuantity}{' '}
                    per batch
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="release-source"
              label="Pick components from"
              select
              required
              fullWidth
              value={sourceLocationId}
              onChange={(event) => {
                // A new source is a new plan: the old one's lots are not here.
                setPlan(null);
                setPlanError(null);
                setPicks({});
                setSource(event.target.value);
              }}
            >
              {locations.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name}
                </MenuItem>
              ))}
            </TextField>

            {planError && <Alert severity="error">{planError}</Alert>}

            {licenceCheck && (
              <LicencePanel
                check={licenceCheck}
                canOverride={canOverrideLicence}
                reason={overrideReason}
                onReason={setOverrideReason}
              />
            )}

            {trackedLines.map((line) => {
              const picking = picks[line.componentVariantId];

              return (
                <Stack key={line.componentVariantId} spacing={1}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Typography variant="subtitle2">
                      {line.sku} — needs {line.quantity} {line.unitOfMeasure}
                    </Typography>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() =>
                        picking
                          ? stopPicking(line.componentVariantId)
                          : startPicking(line)
                      }
                    >
                      {picking ? 'Use earliest expiry' : 'Choose lots'}
                    </Button>
                  </Stack>

                  {line.shortBy && (
                    <Alert severity="warning">
                      This location is {line.shortBy} {line.unitOfMeasure} short
                      across all its lots.
                    </Alert>
                  )}

                  {!picking && (
                    <Typography variant="body2" color="text.secondary">
                      {line.lots.some((lot) => lot.taken)
                        ? line.lots
                            .filter((lot) => lot.taken)
                            .map(
                              (lot) =>
                                `${lot.code}${lot.expiresAt ? ` (expires ${formatDay(lot.expiresAt)})` : ''}: ${lot.take}`,
                            )
                            .join(' · ')
                        : 'No lots of this at the chosen location.'}
                    </Typography>
                  )}

                  {picking && (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Lot</TableCell>
                            <TableCell>Expires</TableCell>
                            <TableCell align="right">On hand</TableCell>
                            <TableCell align="right">Use</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {line.lots.map((lot) => (
                            <TableRow key={lot.lotId}>
                              <TableCell>{lot.code}</TableCell>
                              <TableCell>
                                {lot.expiresAt
                                  ? formatDay(lot.expiresAt)
                                  : 'Does not expire'}
                              </TableCell>
                              <TableCell align="right">{lot.onHand}</TableCell>
                              <TableCell align="right" sx={{ width: 140 }}>
                                <TextField
                                  size="small"
                                  value={picking[lot.lotId] ?? ''}
                                  onChange={(event) =>
                                    setPick(
                                      line.componentVariantId,
                                      lot.lotId,
                                      event.target.value,
                                    )
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      inputMode: 'decimal',
                                      maxLength: 19,
                                      'aria-label': `Use from lot ${lot.code}`,
                                    },
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {picking &&
                    (() => {
                      const total = sumDecimals(Object.values(picking));

                      if (total === null) {
                        return (
                          <Typography variant="caption" color="error">
                            Enter each amount as a number, up to four decimal
                            places.
                          </Typography>
                        );
                      }

                      const matches = total === toScaled(line.quantity);

                      return (
                        <Typography
                          variant="caption"
                          color={matches ? 'text.secondary' : 'error'}
                        >
                          Chosen {fromScaled(total)} of {line.quantity}{' '}
                          {line.unitOfMeasure}
                          {matches ? '' : ' — the amounts must add up exactly'}
                        </Typography>
                      );
                    })()}
                </Stack>
              );
            })}

            {needsRecipe && (
              <Typography variant="caption" color="text.secondary">
                Lot-tracked components are taken earliest expiry first.
              </Typography>
            )}

            <Alert severity="info">
              Releasing copies the recipe onto this run and moves the components
              to where it is made. Editing the recipe afterwards will not change
              what this run consumed.
            </Alert>

            {/* Said plainly because "released" sounds terminal and is not:
                material has moved but nothing has been used up yet. */}
            <Typography variant="caption" color="text.secondary">
              Nothing is consumed yet — that happens when you close the run,
              with the amounts actually used.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label="Release"
          pendingLabel="Releasing…"
          disabled={(needsRecipe && !chosenBom) || !picksMatch || licenceStops}
        />
      </form>
    </Dialog>
  );
}

/**
 * The recipe's licence and what release will do with it (ADR-050).
 *
 * Nothing at all for a recipe with no licence that the organization lets
 * through: a business making nothing regulated should never meet this. A
 * current licence is one quiet line. Anything else says what is wrong, and
 * either that it cannot be released, that it can with a reason, or that
 * the organization allows it and the run will record it.
 */
function LicencePanel({
  check,
  canOverride,
  reason,
  onReason,
}: {
  check: LicenceCheck;
  canOverride: boolean;
  reason: string;
  onReason: (reason: string) => void;
}) {
  const { licence, status, outcome } = check;

  if (!licence) {
    return outcome === 'block' ? (
      <Alert severity="error">
        This recipe carries no licence, and your organization requires one
        before a run is released. Attach one to the recipe first.
      </Alert>
    ) : null;
  }

  const name = `${licence.number} (${licence.authority})`;

  if (status === 'current') {
    return (
      <Typography variant="body2" color="text.secondary">
        Made under {name}, current.
      </Typography>
    );
  }

  const problem =
    status === 'withdrawn'
      ? `${name} has been withdrawn.`
      : status === 'expired'
        ? `${name} expired on ${licence.expiresAt ? formatDay(licence.expiresAt) : 'an unknown date'}.`
        : `${name} is not in force until ${licence.issuedAt ? formatDay(licence.issuedAt) : 'a later date'}.`;

  if (outcome === 'block') {
    return (
      <Alert severity="error">
        {problem}{' '}
        {status === 'withdrawn'
          ? 'Nothing can be made under it.'
          : 'Your organization does not release runs under it.'}
      </Alert>
    );
  }

  if (outcome === 'allow') {
    return (
      <Alert severity="info">
        {problem} Your organization allows releasing under it; the run will
        record that it was{' '}
        {status === 'expired' ? 'expired' : 'not yet in force'}.
      </Alert>
    );
  }

  if (!canOverride) {
    return (
      <Alert severity="error">
        {problem} Releasing under it needs an override from someone allowed to
        give one, with a reason.
      </Alert>
    );
  }

  return (
    <Stack spacing={1}>
      <Alert severity="warning">
        {problem} You can release under it with a reason, which is kept on the
        run and shown wherever the batch is traced.
      </Alert>
      <TextField
        id="release-licence-reason"
        label="Reason for releasing anyway"
        required
        fullWidth
        multiline
        minRows={2}
        value={reason}
        onChange={(event) => onReason(event.target.value)}
        helperText="For example: renewal filed 3 Sept, confirmed by the regulator."
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </Stack>
  );
}
