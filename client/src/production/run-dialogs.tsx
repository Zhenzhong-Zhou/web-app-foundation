import {
  Alert,
  Button,
  Dialog,
  DialogActions,
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

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';
import type {
  Bom,
  IssuePlanLine,
  LineVariance,
  Lot,
  OutputVariance,
  ProductionRun,
  RunDetail,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';

interface LocationSummary {
  id: string;
  name: string;
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
  onClose,
  onReleased,
}: {
  open: boolean;
  run: ProductionRun;
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

  /** Hand-picked quantities per component, keyed by lot id. */
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>(
    {},
  );

  useEffect(() => {
    if (!open || needsRecipe || !sourceLocationId) return;

    let ignore = false;

    void api<{ lines: IssuePlanLine[] }>(
      `/production-orders/${run.id}/issue-plan?sourceLocationId=${sourceLocationId}`,
    )
      .then((result) => {
        if (!ignore) setPlan(result.lines);
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
        if (!ignore) setLocations(rows);
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
        }),
      });
    });
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
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

                  {picking && (
                    <Typography variant="caption" color="text.secondary">
                      The amounts must add up to {line.quantity}. The server
                      checks when you release.
                    </Typography>
                  )}
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

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || (needsRecipe && !chosenBom)}
          >
            {submitting ? 'Releasing…' : 'Release'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * Output: repeatable, and defaulting to the lot already open on this run.
 *
 * Joining is the default because of how recalls fail. One batch split across
 * two lots means recalling the second leaves the first — the same material —
 * on shelves; two batches merged means recalling one pulls both, which is
 * wasteful and safe (ADR-032).
 */
export function RecordOutputDialog({
  open,
  run,
  onClose,
  onRecorded,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onRecorded: () => Promise<void> | void;
}) {
  const [quantity, setQuantity] = useState('');
  const [lotChoice, setLotChoice] = useState('');
  const [newCode, setNewCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [lots, setLots] = useState<Lot[]>([]);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onRecorded();
    },
    { success: 'Output recorded' },
  );

  /**
   * The run knows its batches only by id. Their codes live on the lots,
   * which are listed per variant — so fetched on open and matched up, rather
   * than widening the run response for one dialog.
   */
  useEffect(() => {
    if (!open || run.outputLots.length === 0) return;

    let ignore = false;

    void api<Lot[]>(`/stock/lots?variantId=${run.outputVariantId}`)
      .then((rows) => {
        if (!ignore) setLots(rows);
      })
      // Silent: without codes the options still work, they just say less.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [open, run.outputVariantId, run.outputLots.length]);

  /**
   * "Batch 24-118, expires 10 Oct 2026". Every option used to read "Add to
   * the batch already open", which was fine for one batch and meaningless
   * for two — the choice this field exists for.
   */
  function describeLot(lotId: string): string {
    const lot = lots.find((row) => row.id === lotId);
    if (!lot) return 'An existing batch';

    return lot.expiresAt
      ? `Batch ${lot.code}, expires ${formatDay(lot.expiresAt)}`
      : `Batch ${lot.code}`;
  }

  const openLot = run.outputLots[run.outputLots.length - 1] ?? '';
  const effective = lotChoice || openLot;

  function close() {
    setQuantity('');
    setLotChoice('');
    setNewCode('');
    setExpiresAt('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/production-orders/${run.id}/output`, {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          lotId: effective === 'new' ? undefined : effective || undefined,
          lot:
            effective === 'new' || !openLot
              ? {
                  code: newCode,
                  expiresAt: expiresAt
                    ? new Date(expiresAt).toISOString()
                    : undefined,
                }
              : undefined,
        }),
      }),
    );
  }

  const makingNew = effective === 'new' || !openLot;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Record output</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="output-quantity"
              label="Finished this time"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              helperText={`${run.quantityProduced} recorded so far against a plan of ${run.quantityPlanned}.`}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {openLot && (
              <TextField
                id="output-lot"
                label="Batch number"
                select
                fullWidth
                value={effective}
                onChange={(event) => setLotChoice(event.target.value)}
                helperText="Same batch unless this part was genuinely separate."
              >
                {run.outputLots.map((lotId) => (
                  <MenuItem key={lotId} value={lotId}>
                    Add to {describeLot(lotId)}
                  </MenuItem>
                ))}
                <MenuItem value="new">Start a new batch</MenuItem>
              </TextField>
            )}

            {makingNew && (
              <>
                <TextField
                  id="output-lot-code"
                  label="Batch number"
                  required
                  fullWidth
                  value={newCode}
                  onChange={(event) => setNewCode(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 64 } }}
                />

                <TextField
                  id="output-expires"
                  label="Expires"
                  type="date"
                  fullWidth
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </>
            )}

            <Typography variant="caption" color="text.secondary">
              The run stays open until you close it, so a batch made over
              several days is recorded a bit at a time.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Recording…' : 'Record'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * Close: actual quantities per line, then consumption is written.
 *
 * Every line is pre-filled with what was planned, so the only thing to type is
 * what differed. Leaving one alone means "this went as planned", which is what
 * the operator is asserting by closing.
 */
/** What close reports back: lines off plan, and the yield if it was too. */
export interface CloseResult {
  variances: LineVariance[];
  outputVariance: OutputVariance | null;
}

export function CloseRunDialog({
  open,
  run,
  onClose,
  onClosed,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onClosed: (result: CloseResult) => Promise<void> | void;
}) {
  const stocked = run.lines.filter((line) => line.supplyType === 'stocked');

  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(stocked.map((line) => [line.id, line.quantityPlanned])),
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
    },
    { success: 'Run closed' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      const result = await api<CloseResult>(
        `/production-orders/${run.id}/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            lines: stocked
              .filter((line) => amounts[line.id] !== line.quantityPlanned)
              .map((line) => ({
                lineId: line.id,
                quantityConsumed: amounts[line.id],
              })),
          }),
        },
      );

      close();
      await onClosed(result);
    });
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Close this run</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              Enter what was actually used. Anything left as planned is recorded
              as planned.
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Component</TableCell>
                    <TableCell align="right">Planned</TableCell>
                    <TableCell align="right">Actually used</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {stocked.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell align="right">
                        {line.quantityPlanned} {line.unitOfMeasure}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          id={`close-line-${line.id}`}
                          size="small"
                          value={amounts[line.id] ?? ''}
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: 'decimal',
                              maxLength: 19,
                              style: { textAlign: 'right' },
                            },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Over plan is normal and is never refused — the material was
                already used. Anything short stays where it was issued, for a
                person to put away (ADR-032). */}
            <Alert severity="info">
              Using more than planned is fine — the extra is taken from the same
              place the rest came from. Anything left over stays where the run
              is and needs putting away by hand.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Closing…' : 'Close run'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function CancelRunDialog({
  open,
  run,
  onClose,
  onCancelled,
}: {
  open: boolean;
  run: RunDetail;
  onClose: () => void;
  onCancelled: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCancelled();
    },
    { success: 'Run cancelled' },
  );

  function close() {
    setReason('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/production-orders/${run.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    );
  }

  const issued = run.status === 'released';

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Cancel this run</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {issued && (
              <Alert severity="warning">
                The components already issued stay where the run is. Cancelling
                does not carry them back — somebody has to move them.
              </Alert>
            )}

            <TextField
              id="cancel-reason"
              label="Why"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="The first thing whoever finds the leftover material will ask."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Keep it
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Cancelling…' : 'Cancel run'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
