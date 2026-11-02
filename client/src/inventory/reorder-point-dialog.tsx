import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type {
  Bom,
  ReorderPointDetail,
  ReorderPointPreview,
  ReorderPointRow,
  ReorderPointValues,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api, ApiError, hasCode, messageFor, withQuery } from '../lib/api';
import type { ReorderRule, ReorderSource } from '../lib/api-names';
import {
  displayQuantity,
  groupedNumberMessage,
  itemName,
  toApiDecimal,
} from '../lib/format';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';
import { displayWithUnit, unitLabel } from '../products/units';
import { rem } from '../theme/rem';
import { PositionBar } from './position-bar';
import { RemoveReorderPointDialog } from './remove-reorder-point-dialog';
import { aboveZero, atOrBelowZero, fieldQuantity } from './reorder-points';

/** The item a point is for, as the list's row and the Stock row both name it. */
export type ReorderItem = Pick<
  ReorderPointRow,
  'variantId' | 'sku' | 'productName' | 'variantName' | 'unitOfMeasure'
>;

/**
 * How the dialog opens (ADR-085): Add from the list, with the item picker;
 * Edit from a row, with what is kept; or for an item whose point is not
 * known yet, from the Stock row's menu, read first by its id.
 */
export type ReorderOpening =
  | { kind: 'add' }
  | { kind: 'edit'; item: ReorderItem; point: ReorderPointValues }
  | { kind: 'find'; item: ReorderItem };

/** The rules in the order the cards show them. */
const RULES: readonly ReorderRule[] = ['just_enough', 'fixed', 'maximum'];

const RULE_TITLES = defineMessages<ReorderRule>({
  just_enough: {
    id: 'inventory.reorder.rule.justEnough',
    defaultMessage: 'Just enough',
  },
  fixed: {
    id: 'inventory.reorder.rule.fixed',
    defaultMessage: 'A fixed quantity',
  },
  maximum: {
    id: 'inventory.reorder.rule.maximum',
    defaultMessage: 'Up to a maximum',
  },
});

const RULE_LINES = defineMessages<ReorderRule>({
  just_enough: {
    id: 'inventory.reorder.rule.justEnoughLine',
    defaultMessage: 'The shortfall, back to the point',
  },
  fixed: {
    id: 'inventory.reorder.rule.fixedLine',
    defaultMessage:
      'In whole multiples, as the supplier sells: cases, a minimum',
  },
  maximum: {
    id: 'inventory.reorder.rule.maximumLine',
    defaultMessage: 'Fills it to a level above the point',
  },
});

/** The fields as typed: text, in the language's decimals (ADR-054). */
interface Form {
  /** Null until chosen: Add then takes made when the item has an active recipe. */
  source: ReorderSource | null;
  reorderPoint: string;
  rule: ReorderRule;
  fixedQuantity: string;
  maximumQuantity: string;
}

const EMPTY: Form = {
  source: null,
  reorderPoint: '',
  rule: 'just_enough',
  fixedQuantity: '',
  maximumQuantity: '',
};

function formOf(point: ReorderPointValues): Form {
  return {
    source: point.source,
    reorderPoint: fieldQuantity(point.reorderPoint),
    rule: point.rule,
    fixedQuantity: point.fixedQuantity
      ? fieldQuantity(point.fixedQuantity)
      : '',
    maximumQuantity: point.maximumQuantity
      ? fieldQuantity(point.maximumQuantity)
      : '',
  };
}

/**
 * A field's text as the API takes it, or why not: grouped digits get the
 * shared message; anything not a number above zero with four places at
 * most, "Type a number above zero." Blank is neither, until it is sent.
 */
function readField(
  text: string,
  aboveZeroMessage: string,
): { decimal: string | null; problem: string | null } {
  if (text.trim() === '') return { decimal: null, problem: null };
  const decimal = toApiDecimal(text);
  if (decimal === null) return { decimal, problem: groupedNumberMessage() };
  if (!aboveZero(decimal)) return { decimal: null, problem: aboveZeroMessage };
  return { decimal, problem: null };
}

/** The last preview answered, and the point and quantity it was asked with. */
interface Previewed {
  path: string;
  point: string;
  /** A fixed rule's quantity, for "2 of 1,000"; '' for the other rules. */
  fixedQuantity: string;
  result: ReorderPointPreview | null;
  failure: unknown;
}

/** The item's point by its id: null when it has none, so Add. */
async function pointOf(variantId: string): Promise<ReorderPointValues | null> {
  try {
    const detail = await api<ReorderPointDetail>(
      `/stock/reorder-points/${variantId}`,
    );
    return detail.point;
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
  }
}

/**
 * Add reorder point and Edit (ADR-085): the item, bought or made, the
 * point in the item's unit, how much to order, and Today, what these
 * values would make of the item now. Today is the server's, asked once
 * typing pauses, and an answer older than the newest is dropped; the
 * client adds nothing up (ADR-025). The preview refuses as saving does,
 * so a maximum at or below the point is marked while typing.
 *
 * Opened from the Stock row's menu, it reads the item's point by its id
 * first: none, and it adds one for that item; one, and it edits it. The
 * server's 409, when an item has a point already, offers the same read.
 */
export function ReorderPointDialog({
  opening,
  onClose,
  onSaved,
}: {
  opening: ReorderOpening;
  onClose: () => void;
  onSaved: () => void;
}) {
  const intl = useIntl();
  const [item, setItem] = useState<ReorderItem | null>(
    opening.kind === 'add' ? null : opening.item,
  );
  // The point kept: undefined while it is read, null when there is none.
  const [kept, setKept] = useState<ReorderPointValues | null | undefined>(
    opening.kind === 'edit'
      ? opening.point
      : opening.kind === 'add'
        ? null
        : undefined,
  );
  const [form, setForm] = useState<Form>(() =>
    opening.kind === 'edit' ? formOf(opening.point) : EMPTY,
  );
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const [made, setMade] = useState<{ variantId: string; made: boolean } | null>(
    null,
  );
  const [previewed, setPreviewed] = useState<Previewed | null>(null);
  const [removing, setRemoving] = useState(false);
  const { variants, answered } = useVariants(opening.kind === 'add');

  const editing = !!kept;
  const { submitting, error, errorCode, reset, submit } = useSubmit(onSaved, {
    success: editing
      ? intl.formatMessage({
          id: 'inventory.reorder.saved',
          defaultMessage: 'Reorder point saved',
        })
      : intl.formatMessage({
          id: 'inventory.reorder.added',
          defaultMessage: 'Reorder point added',
        }),
  });

  /** What the read found: Edit with what is kept, or Add when nothing is. */
  function found(point: ReorderPointValues | null) {
    setKept(point);
    if (point) setForm(formOf(point));
  }

  // From the Stock row's menu, the point is not known until it is read.
  const finding = opening.kind === 'find' ? opening.item.variantId : null;
  useEffect(() => {
    if (!finding) return;
    let ignore = false;
    pointOf(finding).then(
      (point) => {
        if (!ignore) found(point);
      },
      (caught: unknown) => {
        if (!ignore) setReadFailure(messageFor(caught));
      },
    );
    return () => {
      ignore = true;
    };
  }, [finding]);

  /** The 409's Edit it: the same read, for the item picked. */
  function editExisting(variantId: string) {
    setKept(undefined);
    setReadFailure(null);
    reset();
    pointOf(variantId).then(found, (caught: unknown) =>
      setReadFailure(messageFor(caught)),
    );
  }

  // Made by default when the item has an active recipe (ADR-085), for a
  // point not yet kept; bought when it has none, or the recipes are not
  // this reader's to see.
  const adding = kept === null && item ? item.variantId : null;
  useEffect(() => {
    if (!adding) return;
    let ignore = false;
    void api<Bom[]>(withQuery('/boms', { outputVariantId: adding }))
      .then((boms) => {
        if (!ignore)
          setMade({
            variantId: adding,
            made: boms.some((bom) => bom.status === 'active'),
          });
      })
      .catch(() => {
        if (!ignore) setMade({ variantId: adding, made: false });
      });
    return () => {
      ignore = true;
    };
  }, [adding]);

  const source: ReorderSource =
    form.source ??
    (made && made.variantId === item?.variantId && made.made
      ? 'made'
      : 'bought');

  const aboveZeroMessage = intl.formatMessage({
    id: 'inventory.reorder.aboveZero',
    defaultMessage: 'Type a number above zero.',
  });
  const point = readField(form.reorderPoint, aboveZeroMessage);
  const fixed = readField(form.fixedQuantity, aboveZeroMessage);
  const maximum = readField(form.maximumQuantity, aboveZeroMessage);
  const quantity =
    form.rule === 'fixed' ? fixed : form.rule === 'maximum' ? maximum : null;

  // What the server is asked, once every field it needs reads as a number
  // above zero; nothing while one does not.
  const values =
    item &&
    kept !== undefined &&
    point.decimal &&
    (!quantity || quantity.decimal)
      ? {
          source,
          reorderPoint: point.decimal,
          rule: form.rule,
          ...(form.rule === 'fixed' && { fixedQuantity: fixed.decimal! }),
          ...(form.rule === 'maximum' && { maximumQuantity: maximum.decimal! }),
        }
      : null;
  const previewPath =
    item && values
      ? withQuery(`/stock/reorder-points/${item.variantId}/preview`, values)
      : null;
  const previewPoint = values?.reorderPoint ?? '';
  const previewFixed = values?.fixedQuantity ?? '';

  // Asked once typing pauses; an answer to an older question is dropped
  // when a newer one is asked, by the effect's own cleanup.
  useEffect(() => {
    if (!previewPath) return;
    let ignore = false;
    const timer = setTimeout(() => {
      void api<ReorderPointPreview>(previewPath)
        .then((result) => {
          if (!ignore)
            setPreviewed({
              path: previewPath,
              point: previewPoint,
              fixedQuantity: previewFixed,
              result,
              failure: null,
            });
        })
        .catch((caught: unknown) => {
          if (!ignore)
            setPreviewed({
              path: previewPath,
              point: previewPoint,
              fixedQuantity: previewFixed,
              result: null,
              failure: caught,
            });
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [previewPath, previewPoint, previewFixed]);

  // A refusal is about the values it was asked with, so only those.
  const previewFailure =
    previewed && previewed.path === previewPath ? previewed.failure : null;
  const previewCode =
    previewFailure instanceof ApiError ? (previewFailure.code ?? null) : null;
  const maximumRefusal = hasCode(previewCode, 'reorder_maximum_not_above_point')
    ? messageFor(previewFailure)
    : hasCode(errorCode, 'reorder_maximum_not_above_point')
      ? error
      : null;
  const exists = hasCode(errorCode, 'reorder_point_exists');
  // Said at the picker, not at the top, so focus goes to it once refused,
  // and a screen reader hears the refusal with it (WCAG 4.1.3).
  useEffect(() => {
    if (exists) document.getElementById('reorder-item')?.focus();
  }, [exists]);
  // Shown at its field, or not at all, rather than at the top too.
  const formError =
    exists || hasCode(errorCode, 'reorder_maximum_not_above_point')
      ? null
      : (error ?? readFailure);

  function change(next: Partial<Form>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!item || !values) return;
    void submit(() =>
      api(`/stock/reorder-points/${item.variantId}`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      }),
    );
  }

  const unit = item ? unitLabel(item.unitOfMeasure, intl) : '';
  const unitInside = unit
    ? {
        input: {
          endAdornment: <InputAdornment position="end">{unit}</InputAdornment>,
        },
        htmlInput: { inputMode: 'decimal' as const },
      }
    : { htmlInput: { inputMode: 'decimal' as const } };

  const title =
    kept === undefined
      ? intl.formatMessage({
          id: 'inventory.reorder.dialogTitle',
          defaultMessage: 'Reorder point',
        })
      : editing
        ? intl.formatMessage({
            id: 'inventory.reorder.edit',
            defaultMessage: 'Edit reorder point',
          })
        : intl.formatMessage({
            id: 'inventory.reorder.add',
            defaultMessage: 'Add reorder point',
          });

  if (removing && item) {
    return (
      <RemoveReorderPointDialog
        variantId={item.variantId}
        sku={item.sku}
        onClose={() => setRemoving(false)}
        onRemoved={onSaved}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <FormError message={formError} />}

            {opening.kind === 'add' && !editing ? (
              <Stack spacing={0.5}>
                <VariantPicker
                  id="reorder-item"
                  label={intl.formatMessage({
                    id: 'inventory.item',
                    defaultMessage: 'Item',
                  })}
                  required
                  autoFocus
                  options={variants}
                  loading={!answered}
                  value={item?.variantId ?? ''}
                  onChange={(variantId) => {
                    const picked = variants.find((row) => row.id === variantId);
                    setItem(
                      picked
                        ? {
                            variantId: picked.id,
                            sku: picked.sku,
                            productName: picked.productName,
                            variantName: picked.variantName,
                            unitOfMeasure: picked.unitOfMeasure,
                          }
                        : null,
                    );
                    change({ source: null });
                    reset();
                  }}
                  // The 409, at the picker and read with it (WCAG 3.3.1).
                  error={exists}
                  helperText={
                    exists &&
                    item &&
                    intl.formatMessage(
                      {
                        id: 'inventory.reorder.exists',
                        defaultMessage: '{refusal} {editIt}',
                      },
                      {
                        refusal: error,
                        editIt: (
                          <Link
                            component="button"
                            type="button"
                            underline="always"
                            onClick={() => editExisting(item.variantId)}
                          >
                            {intl.formatMessage({
                              id: 'inventory.reorder.editIt',
                              defaultMessage: 'Edit it',
                            })}
                          </Link>
                        ),
                      },
                    )
                  }
                />
              </Stack>
            ) : (
              item && (
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'inventory.reorder.item',
                      defaultMessage: '{sku} {name}',
                    },
                    {
                      sku: (
                        <Box component="span" sx={{ fontWeight: 600 }}>
                          {item.sku}
                        </Box>
                      ),
                      name: itemName(item.productName, item.variantName),
                    },
                  )}
                </Typography>
              )
            )}

            {kept === undefined ? (
              // Read first; a failed read says so above, and nothing here.
              !readFailure && (
                <Stack spacing={1}>
                  <Skeleton height={48} />
                  <Skeleton height={48} />
                </Stack>
              )
            ) : (
              <>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={source}
                  onChange={(_, next: ReorderSource | null) => {
                    if (next) change({ source: next });
                  }}
                  aria-label={intl.formatMessage({
                    id: 'inventory.reorder.source',
                    defaultMessage: 'Bought or made',
                  })}
                >
                  <ToggleButton value="bought">
                    {intl.formatMessage({
                      id: 'inventory.reorder.bought',
                      defaultMessage: 'Bought',
                    })}
                  </ToggleButton>
                  <ToggleButton value="made">
                    {intl.formatMessage({
                      id: 'inventory.reorder.made',
                      defaultMessage: 'Made',
                    })}
                  </ToggleButton>
                </ToggleButtonGroup>

                <TextField
                  id="reorder-point"
                  label={intl.formatMessage({
                    id: 'inventory.reorder.point',
                    defaultMessage: 'Reorder point',
                  })}
                  required
                  // The first field once the item is known: Edit's, the
                  // 409's Edit it, a Stock row's (the picker is Add's).
                  autoFocus={opening.kind !== 'add' || editing}
                  value={form.reorderPoint}
                  onChange={(event) =>
                    change({ reorderPoint: event.target.value })
                  }
                  error={!!point.problem}
                  helperText={point.problem ?? undefined}
                  slotProps={unitInside}
                />

                <Stack spacing={1}>
                  <Typography
                    id="reorder-rule-label"
                    variant="body2"
                    sx={{ fontWeight: 600 }}
                  >
                    {intl.formatMessage({
                      id: 'inventory.reorder.howMuch',
                      defaultMessage: 'How much to order',
                    })}
                  </Typography>
                  <RadioGroup
                    aria-labelledby="reorder-rule-label"
                    value={form.rule}
                    onChange={(event) =>
                      change({ rule: event.target.value as ReorderRule })
                    }
                  >
                    <Stack spacing={1}>
                      {RULES.map((rule) => (
                        <Paper
                          key={rule}
                          variant="outlined"
                          sx={{
                            px: 1.5,
                            py: 1,
                            ...(form.rule === rule && {
                              borderColor: 'primary.main',
                            }),
                          }}
                        >
                          <FormControlLabel
                            value={rule}
                            control={<Radio />}
                            label={
                              <Stack spacing={0.25}>
                                <span>
                                  {intl.formatMessage(RULE_TITLES[rule])}
                                </span>
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  {intl.formatMessage(RULE_LINES[rule])}
                                </Typography>
                              </Stack>
                            }
                          />
                          {rule === 'fixed' && form.rule === 'fixed' && (
                            <TextField
                              id="reorder-fixed"
                              size="small"
                              label={intl.formatMessage({
                                id: 'inventory.reorder.fixedQuantity',
                                defaultMessage: 'Quantity',
                              })}
                              required
                              value={form.fixedQuantity}
                              onChange={(event) =>
                                change({ fixedQuantity: event.target.value })
                              }
                              error={!!fixed.problem}
                              helperText={fixed.problem ?? undefined}
                              slotProps={unitInside}
                              sx={{ mt: 1, ml: 4 }}
                            />
                          )}
                          {rule === 'maximum' && form.rule === 'maximum' && (
                            <TextField
                              id="reorder-maximum"
                              size="small"
                              label={intl.formatMessage({
                                id: 'inventory.reorder.maximum',
                                defaultMessage: 'Maximum',
                              })}
                              required
                              value={form.maximumQuantity}
                              onChange={(event) =>
                                change({ maximumQuantity: event.target.value })
                              }
                              error={!!(maximum.problem ?? maximumRefusal)}
                              helperText={
                                maximum.problem ?? maximumRefusal ?? undefined
                              }
                              slotProps={unitInside}
                              sx={{ mt: 1, ml: 4 }}
                            />
                          )}
                        </Paper>
                      ))}
                    </Stack>
                  </RadioGroup>
                </Stack>

                {values && previewed && (
                  <Today
                    previewed={previewed}
                    current={previewed.path === previewPath}
                    unit={item?.unitOfMeasure ?? ''}
                    source={source}
                  />
                )}
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={onClose}
          disabled={kept === undefined}
          label={
            editing
              ? intl.formatMessage({
                  id: 'common.save',
                  defaultMessage: 'Save',
                })
              : title
          }
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
          start={
            editing && (
              <Button
                variant="text"
                color="error"
                disabled={submitting}
                onClick={() => setRemoving(true)}
              >
                {intl.formatMessage({
                  id: 'inventory.reorder.remove',
                  defaultMessage: 'Remove reorder point',
                })}
              </Button>
            )
          }
        />
      </form>
    </Dialog>
  );
}

/**
 * Today (ADR-085): where the item stands now and once the suggested order
 * arrives, the server's figures, and one sentence saying why. The last
 * answer stays while the next is asked; a refusal not about a field says
 * itself here. Its words follow bought or made, as the glossary's do:
 * 建议生产 for a made item, not 建议订货.
 */
function Today({
  previewed,
  current,
  unit,
  source,
}: {
  previewed: Previewed;
  /** Whether it answers the values as they are now. */
  current: boolean;
  unit: string;
  source: ReorderSource;
}) {
  const intl = useIntl();
  const { result, failure, point } = previewed;

  if (!result) {
    const fielded =
      failure instanceof ApiError &&
      hasCode(failure.code ?? null, 'reorder_maximum_not_above_point');
    return current && !fielded ? (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {messageFor(failure)}
      </Typography>
    ) : null;
  }

  const shown = displayQuantity(point);
  const sentence =
    result.status === 'discontinued'
      ? intl.formatMessage({
          id: 'inventory.reorder.today.discontinued',
          defaultMessage:
            'It is discontinued, so it is never low; its point is kept.',
        })
      : result.status === 'enough'
        ? intl.formatMessage(
            {
              id: 'inventory.reorder.today.enough',
              defaultMessage:
                'At or above {point} now, so it would {source, select, other {suggest}} nothing.',
            },
            { point: shown, source },
          )
        : result.drafted
          ? intl.formatMessage(
              {
                id: 'inventory.reorder.today.drafted',
                defaultMessage:
                  'Below {point} now, and what is in draft covers it, so it would {source, select, other {suggest}} nothing more.',
              },
              { point: shown, source },
            )
          : result.suggestedMultiples
            ? intl.formatMessage(
                {
                  id: 'inventory.reorder.today.fixed',
                  defaultMessage:
                    'Below {point} now, so it would {source, select, other {suggest}} {suggestion}, {count} of {quantity}.',
                },
                {
                  point: shown,
                  source,
                  suggestion: displayQuantity(result.suggestion),
                  count: displayQuantity(result.suggestedMultiples),
                  quantity: displayQuantity(previewed.fixedQuantity),
                },
              )
            : intl.formatMessage(
                {
                  id: 'inventory.reorder.today.low',
                  defaultMessage:
                    'Below {point} now, so it would {source, select, other {suggest}} {suggestion}.',
                },
                {
                  point: shown,
                  source,
                  suggestion: displayQuantity(result.suggestion),
                },
              );

  const bars = [
    {
      id: 'now',
      label: intl.formatMessage({
        id: 'inventory.reorder.today.now',
        defaultMessage: 'Now',
      }),
      position: result.position,
      status: result.status,
    },
    {
      id: 'after',
      label: intl.formatMessage(
        {
          id: 'inventory.reorder.today.after',
          defaultMessage: '{source, select, other {After the suggested order}}',
        },
        { source },
      ),
      position: result.after,
      status: result.afterStatus,
    },
  ];

  return (
    <Stack spacing={1} aria-live="polite" sx={{ opacity: current ? 1 : 0.6 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {intl.formatMessage({
          id: 'inventory.reorder.today',
          defaultMessage: 'Today',
        })}
      </Typography>
      {bars.map((bar) => (
        <Stack
          key={bar.id}
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}
        >
          <Typography variant="body2" sx={{ minWidth: rem(200) }}>
            {bar.label}
          </Typography>
          <PositionBar
            position={bar.position}
            point={point}
            status={bar.status}
          />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              ...(atOrBelowZero(bar.position) && { color: 'error.main' }),
            }}
          >
            {displayWithUnit(bar.position, unit, intl)}
          </Typography>
        </Stack>
      ))}
      <Typography variant="body2">{sentence}</Typography>
    </Stack>
  );
}
