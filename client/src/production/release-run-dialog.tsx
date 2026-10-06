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
import { type IntlShape, useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { fromScaled, sumDecimals, toScaled } from '../lib/decimal';
import {
  formatDay,
  formatQuantity,
  groupedNumberMessage,
  nameAndCode,
  SEPARATOR,
  toApiDecimal,
} from '../lib/format';
import type {
  Bom,
  IssuePlan,
  IssuePlanLine,
  LicenceCheck,
  ProductionRun,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { withUnit } from '../products/units';

/**
 * The lots chosen for one component, added up exactly (ADR-025), each read
 * the reader's way first. Null when any amount is not a number.
 */
function pickedTotal(picking: Record<string, string>): bigint | null {
  return sumDecimals(
    Object.values(picking).map((value) => toApiDecimal(value) ?? 'x'),
  );
}

/** What "Chosen {chosen} of {needed}" fills in, the reader's way. */
function chosenValues(
  intl: IntlShape,
  chosen: string,
  needed: string,
  unit: string,
) {
  return {
    chosen: formatQuantity(chosen),
    needed: withUnit(needed, unit, intl),
  };
}

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
  const intl = useIntl();
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
            caught instanceof Error
              ? caught.message
              : intl.formatMessage({
                  id: 'production.release.lotsFailed',
                  defaultMessage: 'Could not load lots.',
                }),
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [open, needsRecipe, sourceLocationId, run.id, intl]);

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

    const total = pickedTotal(picking);
    return total !== null && total === toScaled(line.quantity);
  });

  function startPicking(line: IssuePlanLine) {
    setPicks((current) => ({
      ...current,
      [line.componentVariantId]: Object.fromEntries(
        // Shown the reader's way, 2,5000 in French, and read back the same.
        line.lots.map((lot) => [
          lot.lotId,
          lot.taken ? formatQuantity(lot.take) : '',
        ]),
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
    {
      success: intl.formatMessage({
        id: 'production.released',
        defaultMessage: 'Run released',
      }),
    },
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
            // The button waits until every amount reads one way, so none is
            // null here; the comma becomes the API's point.
            .map(([lotId, quantity]) => ({
              lotId,
              quantity: toApiDecimal(quantity),
            })),
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
        <DialogTitle>
          {intl.formatMessage({
            id: 'production.release.title',
            defaultMessage: 'Release this run',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {needsRecipe && recipes.length === 0 && (
              <Alert severity="warning">
                {intl.formatMessage({
                  id: 'production.release.noRecipe',
                  defaultMessage:
                    "There is no recipe for this item yet. Create one on the product's page and make it active, then release.",
                })}
              </Alert>
            )}

            {needsRecipe && recipes.length > 0 && (
              <TextField
                id="release-recipe"
                label={intl.formatMessage({
                  id: 'production.recipe',
                  defaultMessage: 'Recipe',
                })}
                select
                required
                fullWidth
                value={chosenBom}
                onChange={(event) => setBomId(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'production.release.recipe.help',
                  defaultMessage:
                    'This run was planned without one. It is attached before releasing.',
                })}
              >
                {recipes.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {row.status === 'active'
                      ? intl.formatMessage(
                          {
                            id: 'production.release.recipeActive',
                            defaultMessage:
                              'v{version} — active, makes {quantity} per batch',
                          },
                          {
                            version: row.version,
                            quantity: formatQuantity(row.outputQuantity),
                          },
                        )
                      : intl.formatMessage(
                          {
                            id: 'production.release.recipeArchived',
                            defaultMessage:
                              'v{version} — archived, makes {quantity} per batch',
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
              id="release-source"
              label={intl.formatMessage({
                id: 'production.release.source',
                defaultMessage: 'Pick components from',
              })}
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
                      {intl.formatMessage(
                        {
                          id: 'production.release.needs',
                          defaultMessage: '{sku} — needs {amount}',
                        },
                        {
                          sku: line.sku,
                          amount: withUnit(
                            line.quantity,
                            line.unitOfMeasure,
                            intl,
                          ),
                        },
                      )}
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
                      {picking
                        ? intl.formatMessage({
                            id: 'orders.ship.earliestExpiry',
                            defaultMessage: 'Use earliest expiry',
                          })
                        : intl.formatMessage({
                            id: 'orders.ship.chooseLots',
                            defaultMessage: 'Choose lots',
                          })}
                    </Button>
                  </Stack>

                  {line.shortBy && (
                    <Alert severity="warning">
                      {intl.formatMessage(
                        {
                          id: 'production.release.short',
                          defaultMessage:
                            'This location is {amount} short across all its lots.',
                        },
                        {
                          amount: withUnit(
                            line.shortBy,
                            line.unitOfMeasure,
                            intl,
                          ),
                        },
                      )}
                    </Alert>
                  )}

                  {!picking && (
                    <Typography variant="body2" color="text.secondary">
                      {line.lots.some((lot) => lot.taken)
                        ? line.lots
                            .filter((lot) => lot.taken)
                            .map((lot) =>
                              lot.expiresAt
                                ? intl.formatMessage(
                                    {
                                      id: 'orders.ship.lotTakeExpiring',
                                      defaultMessage:
                                        '{code} (expires {day}): {quantity}',
                                    },
                                    {
                                      code: lot.code,
                                      day: formatDay(lot.expiresAt),
                                      quantity: formatQuantity(lot.take),
                                    },
                                  )
                                : intl.formatMessage(
                                    {
                                      id: 'orders.ship.lotTake',
                                      defaultMessage: '{code}: {quantity}',
                                    },
                                    {
                                      code: lot.code,
                                      quantity: formatQuantity(lot.take),
                                    },
                                  ),
                            )
                            .join(SEPARATOR)
                        : intl.formatMessage({
                            id: 'orders.ship.noLots',
                            defaultMessage:
                              'No lots of this at the chosen location.',
                          })}
                    </Typography>
                  )}

                  {picking && (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              {intl.formatMessage({
                                id: 'inventory.lot',
                                defaultMessage: 'Lot',
                              })}
                            </TableCell>
                            <TableCell>
                              {intl.formatMessage({
                                id: 'inventory.lot.expires',
                                defaultMessage: 'Expires',
                              })}
                            </TableCell>
                            <TableCell align="right">
                              {intl.formatMessage({
                                id: 'inventory.promised.onHand',
                                defaultMessage: 'On hand',
                              })}
                            </TableCell>
                            <TableCell align="right">
                              {intl.formatMessage({
                                id: 'production.release.use',
                                defaultMessage: 'Use',
                              })}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {line.lots.map((lot) => (
                            <TableRow key={lot.lotId}>
                              <TableCell>{lot.code}</TableCell>
                              <TableCell>
                                {lot.expiresAt
                                  ? formatDay(lot.expiresAt)
                                  : intl.formatMessage({
                                      id: 'orders.ship.noExpiry',
                                      defaultMessage: 'Does not expire',
                                    })}
                              </TableCell>
                              <TableCell align="right">
                                {formatQuantity(lot.onHand)}
                              </TableCell>
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
                                      'aria-label': intl.formatMessage(
                                        {
                                          id: 'production.release.useFromLot',
                                          defaultMessage: 'Use from lot {code}',
                                        },
                                        { code: lot.code },
                                      ),
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
                      if (
                        Object.values(picking).some(
                          (value) => toApiDecimal(value) === null,
                        )
                      ) {
                        return (
                          <Typography variant="caption" color="error">
                            {groupedNumberMessage()}
                          </Typography>
                        );
                      }

                      const total = pickedTotal(picking);

                      if (total === null) {
                        return (
                          <Typography variant="caption" color="error">
                            {intl.formatMessage({
                              id: 'production.release.amountsInvalid',
                              defaultMessage:
                                'Enter each amount as a number, up to four decimal places.',
                            })}
                          </Typography>
                        );
                      }

                      const matches = total === toScaled(line.quantity);

                      return (
                        <Typography
                          variant="caption"
                          color={matches ? 'text.secondary' : 'error'}
                        >
                          {matches
                            ? intl.formatMessage(
                                {
                                  id: 'production.release.chosen',
                                  defaultMessage: 'Chosen {chosen} of {needed}',
                                },
                                chosenValues(
                                  intl,
                                  fromScaled(total),
                                  line.quantity,
                                  line.unitOfMeasure,
                                ),
                              )
                            : intl.formatMessage(
                                {
                                  id: 'production.release.chosenMismatch',
                                  defaultMessage:
                                    'Chosen {chosen} of {needed} — the amounts must add up exactly',
                                },
                                chosenValues(
                                  intl,
                                  fromScaled(total),
                                  line.quantity,
                                  line.unitOfMeasure,
                                ),
                              )}
                        </Typography>
                      );
                    })()}
                </Stack>
              );
            })}

            {needsRecipe && (
              <Typography variant="caption" color="text.secondary">
                {intl.formatMessage({
                  id: 'production.release.earliestFirst',
                  defaultMessage:
                    'Lot-tracked components are taken earliest expiry first.',
                })}
              </Typography>
            )}

            <Alert severity="info">
              {intl.formatMessage({
                id: 'production.release.copiesRecipe',
                defaultMessage:
                  'Releasing copies the recipe onto this run and moves the components to where it is made. Editing the recipe afterwards will not change what this run consumed.',
              })}
            </Alert>

            {/* Said plainly because "released" sounds terminal and is not:
                material has moved but nothing has been used up yet. */}
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'production.release.nothingConsumed',
                defaultMessage:
                  'Nothing is consumed yet — that happens when you close the run, with the amounts actually used.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'production.release.action',
            defaultMessage: 'Release',
          })}
          pendingLabel={intl.formatMessage({
            id: 'production.release.pending',
            defaultMessage: 'Releasing…',
          })}
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
  const intl = useIntl();
  const { licence, status, outcome } = check;

  if (!licence) {
    return outcome === 'block' ? (
      <Alert severity="error">
        {intl.formatMessage({
          id: 'production.licence.missing',
          defaultMessage:
            'This recipe carries no licence, and your organization requires one before a run is released. Attach one to the recipe first.',
        })}
      </Alert>
    ) : null;
  }

  // "NPN 80012345 (Health Canada)": data, the same in every language.
  const name = nameAndCode(licence.number, licence.authority);

  if (status === 'current') {
    return (
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage(
          {
            id: 'production.licence.current',
            defaultMessage: 'Made under {name}, current.',
          },
          { name },
        )}
      </Typography>
    );
  }

  const problem =
    status === 'withdrawn'
      ? intl.formatMessage(
          {
            id: 'production.licence.withdrawn',
            defaultMessage: '{name} has been withdrawn.',
          },
          { name },
        )
      : status === 'expired'
        ? intl.formatMessage(
            {
              id: 'production.licence.expired',
              defaultMessage: '{name} expired on {date}.',
            },
            {
              name,
              date: licence.expiresAt
                ? formatDay(licence.expiresAt)
                : intl.formatMessage({
                    id: 'production.licence.unknownDate',
                    defaultMessage: 'an unknown date',
                  }),
            },
          )
        : intl.formatMessage(
            {
              id: 'production.licence.notYet',
              defaultMessage: '{name} is not in force until {date}.',
            },
            {
              name,
              date: licence.issuedAt
                ? formatDay(licence.issuedAt)
                : intl.formatMessage({
                    id: 'production.licence.laterDate',
                    defaultMessage: 'a later date',
                  }),
            },
          );

  if (outcome === 'block') {
    return (
      <Alert severity="error">
        {status === 'withdrawn'
          ? intl.formatMessage(
              {
                id: 'production.licence.blockWithdrawn',
                defaultMessage: '{problem} Nothing can be made under it.',
              },
              { problem },
            )
          : intl.formatMessage(
              {
                id: 'production.licence.block',
                defaultMessage:
                  '{problem} Your organization does not release runs under it.',
              },
              { problem },
            )}
      </Alert>
    );
  }

  if (outcome === 'allow') {
    return (
      <Alert severity="info">
        {intl.formatMessage(
          {
            id: 'production.licence.allow',
            defaultMessage:
              '{problem} Your organization allows releasing under it; the run will record that it was {state, select, expired {expired} other {not yet in force}}.',
          },
          { problem, state: status },
        )}
      </Alert>
    );
  }

  if (!canOverride) {
    return (
      <Alert severity="error">
        {intl.formatMessage(
          {
            id: 'production.licence.needsOverride',
            defaultMessage:
              '{problem} Releasing under it needs an override from someone allowed to give one, with a reason.',
          },
          { problem },
        )}
      </Alert>
    );
  }

  return (
    <Stack spacing={1}>
      <Alert severity="warning">
        {intl.formatMessage(
          {
            id: 'production.licence.canOverride',
            defaultMessage:
              '{problem} You can release under it with a reason, which is kept on the run and shown wherever the batch is traced.',
          },
          { problem },
        )}
      </Alert>
      <TextField
        id="release-licence-reason"
        label={intl.formatMessage({
          id: 'production.licence.reason',
          defaultMessage: 'Reason for releasing anyway',
        })}
        required
        fullWidth
        multiline
        minRows={2}
        value={reason}
        onChange={(event) => onReason(event.target.value)}
        helperText={intl.formatMessage({
          id: 'production.licence.reason.help',
          defaultMessage:
            'For example: renewal filed 3 Sept, confirmed by the regulator.',
        })}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </Stack>
  );
}
