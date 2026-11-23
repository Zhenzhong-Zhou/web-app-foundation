import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type {
  LotTrackingQuestion,
  LotTrackingStarted,
  StartLotTrackingDto,
} from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { ListError } from '../components/list-error';
import { Reference } from '../components/reference';
import { ExpiryChoice } from '../inventory/expiry-choice';
import {
  dayError as dayMissing,
  dayFor,
  useNextLotCode,
} from '../inventory/lot-input';
import { useLotMessage } from '../inventory/lot-received';
import { placeName } from '../inventory/stock-places';
import { api } from '../lib/api';
import type { ExpiryKind } from '../lib/api-names';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { displayWithUnit } from './units';

/**
 * Start tracking lots… (ADR-094, R13 and R14), for a code not tracked,
 * from the item's Variants table, from under its By place and lot, or
 * from the code's Actions on Stock (T2, T3): the question says how much
 * is on hand at which places, that one lot made for us takes it all, how
 * its code is made, the runs in progress that will close against it, and
 * that it is one way; it takes the supplier's lot and the expiry where
 * they are known. Confirmed, one write (R15); the message names the lot.
 */
export function StartTrackingDialog({
  productId,
  variantId,
  sku,
  unitOfMeasure,
  onClose,
  onStarted,
}: {
  productId: string;
  variantId: string;
  sku: string;
  unitOfMeasure: string;
  onClose: () => void;
  /**
   * Started: the page reads again, the code reading Tracked; given the
   * places its stock was at, which its lot now holds, none with nothing
   * on hand.
   */
  onStarted: (places: string[]) => void;
}) {
  const intl = useIntl();
  const path = `/products/${productId}/variants/${variantId}/lot-tracking`;
  const question = useResource<LotTrackingQuestion>(path);
  const asked = question.data;
  // Expires starts on Not known yet, shown chosen: stock nobody checked
  // is never said to last for ever by a default no one saw (ADR-094, S6).
  const [form, setForm] = useState<{
    supplierLot: string;
    expiry: ExpiryKind;
    expiresAt: string;
  }>({ supplierLot: '', expiry: 'unknown', expiresAt: '' });
  const [dayError, setDayError] = useState<string | undefined>();
  const dayRef = useRef<HTMLInputElement>(null);
  const message = useLotMessage();
  const example = useNextLotCode();

  const { submitting, error, reset, submit } = useSubmit<LotTrackingStarted>(
    (started) => {
      message(
        started.lot
          ? intl.formatMessage(
              {
                id: 'products.startTracking.done',
                defaultMessage:
                  'Lot tracking started for {sku}. Its stock on hand is in lot {lot}.',
              },
              { sku, lot: started.lot.code },
            )
          : intl.formatMessage(
              {
                id: 'products.startTracking.doneEmpty',
                defaultMessage:
                  'Lot tracking started for {sku}. Each receipt now asks for its lot.',
              },
              { sku },
            ),
        // Open the lot alone: the stock is on the shelves already, its
        // code to write on it when someone next handles it.
        started.lot ? { ...started.lot, made: false } : null,
      );
      close();
      onStarted(
        started.lot
          ? (asked?.places.map((place) => place.locationId) ?? [])
          : [],
      );
    },
  );

  function close() {
    reset();
    onClose();
  }

  const stocked = (asked?.places.length ?? 0) > 0;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asked) return;
    const missing = dayMissing(form.expiry, form.expiresAt, intl);
    if (stocked && missing) {
      setDayError(missing);
      dayRef.current?.focus();
      return;
    }

    // What is known of the stock on hand: a supplier's lot left out is
    // to add, and the expiry is the one chosen, Not known yet unless
    // changed.
    const body: StartLotTrackingDto = stocked
      ? {
          supplierLot: form.supplierLot.trim() || undefined,
          expiry: form.expiry,
          expiresAt: dayFor(form.expiry, form.expiresAt),
        }
      : {};
    void submit(() =>
      api<LotTrackingStarted>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  return (
    <Dialog
      open
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      {/* The body scrolls and the buttons stay in view (#564). */}
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <DialogTitle>
          {intl.formatMessage(
            {
              id: 'products.startTracking.title',
              defaultMessage: 'Start tracking lots for {sku}',
            },
            { sku: <Reference>{sku}</Reference> },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}
            {/* Its places not read: why, with Try again (v16's Error
                state; review 19). */}
            <ListError
              error={question.error}
              onRetry={() => void question.reload()}
            />

            {/* The question while the places are read (ADR-094's states). */}
            {!asked && !question.error && (
              <Stack spacing={1}>
                <Skeleton width="80%" />
                <Skeleton width="60%" />
              </Stack>
            )}

            {asked && (
              <>
                {stocked ? (
                  <Stack spacing={0.5}>
                    <Typography>
                      {example
                        ? intl.formatMessage(
                            {
                              id: 'products.startTracking.onHand',
                              defaultMessage:
                                '{quantity} on hand goes into one lot, its code made for us when you start, like {example}:',
                            },
                            {
                              quantity: displayWithUnit(
                                asked.onHand,
                                unitOfMeasure,
                                intl,
                              ),
                              example: <Reference>{example}</Reference>,
                            },
                          )
                        : intl.formatMessage(
                            {
                              id: 'products.startTracking.onHandPlain',
                              defaultMessage:
                                '{quantity} on hand goes into one lot, its code made for us when you start:',
                            },
                            {
                              quantity: displayWithUnit(
                                asked.onHand,
                                unitOfMeasure,
                                intl,
                              ),
                            },
                          )}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 3 }}>
                      {asked.places.map((place) => (
                        <Typography component="li" key={place.locationId}>
                          {intl.formatMessage(
                            {
                              id: 'inventory.lot.atPlace',
                              defaultMessage: '{quantity} at {place}',
                            },
                            {
                              quantity: displayWithUnit(
                                place.quantity,
                                unitOfMeasure,
                                intl,
                              ),
                              place: placeName(place),
                            },
                          )}
                        </Typography>
                      ))}
                    </Box>
                    {/* What happens to its cost (v16's board; review 16). */}
                    <Typography>
                      {intl.formatMessage({
                        id: 'products.startTracking.cost',
                        defaultMessage:
                          'Its cost goes with it. What still waits for a cost keeps waiting, on this lot.',
                      })}
                    </Typography>
                    {/* One lot now, real lots later (v15's board; review
                        17). */}
                    <Typography>
                      {intl.formatMessage({
                        id: 'products.startTracking.splitLater',
                        defaultMessage:
                          'Split it into real lots later with Move to another lot…',
                      })}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography>
                    {intl.formatMessage({
                      id: 'products.startTracking.nothingOnHand',
                      defaultMessage:
                        'Nothing is on hand, so no lot is made now.',
                    })}
                  </Typography>
                )}

                {asked.runCount > 0 && <RunsLine question={asked} />}

                {/* Amber, as the boards draw it: it cannot be undone
                    (review 18). */}
                <Alert severity="warning">
                  {intl.formatMessage({
                    id: 'products.startTracking.oneWay',
                    defaultMessage:
                      'This cannot be undone: once started, lot tracking stays on, and each receipt asks for its lot.',
                  })}
                </Alert>

                {stocked && (
                  <>
                    <TextField
                      id="start-tracking-supplier-lot"
                      label={intl.formatMessage({
                        id: 'inventory.lot.supplierLot',
                        defaultMessage: 'Supplier’s lot',
                      })}
                      fullWidth
                      value={form.supplierLot}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          supplierLot: event.target.value,
                        }))
                      }
                      helperText={intl.formatMessage({
                        id: 'products.startTracking.supplierLot.help',
                        defaultMessage:
                          'Optional. As the supplier printed it, where the stock on hand came in one delivery; it can be added later.',
                      })}
                      slotProps={{ htmlInput: { maxLength: 64 } }}
                    />
                    <ExpiryChoice
                      idPrefix="start-tracking"
                      required={false}
                      expiry={form.expiry}
                      expiresAt={form.expiresAt}
                      onChange={(next) => {
                        setDayError(undefined);
                        setForm((current) => ({ ...current, ...next }));
                      }}
                      help={
                        form.expiry === 'unknown'
                          ? intl.formatMessage({
                              id: 'products.startTracking.expiry.unknownHelp',
                              defaultMessage:
                                'Listed on Stock, by lot, under Details to add until someone gives the day or says it doesn’t expire. The stock can still be used.',
                            })
                          : undefined
                      }
                      dayRef={dayRef}
                      errors={{ day: dayError }}
                    />
                  </>
                )}
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          disabled={!asked}
          label={intl.formatMessage({
            id: 'products.startTracking.action',
            defaultMessage: 'Start tracking lots',
          })}
          pendingLabel={intl.formatMessage({
            id: 'products.startTracking.pending',
            defaultMessage: 'Starting…',
          })}
        />
      </Box>
    </Dialog>
  );
}

/**
 * The runs in progress that use or make the code (Q2a), each by its
 * reference for a reader who may see runs, else how many: each will
 * close against the lot.
 */
function RunsLine({ question }: { question: LotTrackingQuestion }) {
  const intl = useIntl();
  const unnamed = intl.formatMessage({
    id: 'products.startTracking.runUnnamed',
    defaultMessage: 'a run with no reference',
  });

  return (
    <Typography>
      {question.runs
        ? intl.formatMessage(
            {
              id: 'products.startTracking.runs',
              defaultMessage:
                'Runs in progress that use or make it: {runs}. Each will close against this lot.',
            },
            {
              runs: intl.formatList(
                question.runs.map((run) => run.reference ?? unnamed),
              ),
            },
          )
        : intl.formatMessage(
            {
              id: 'products.startTracking.runCount',
              defaultMessage:
                '{count, plural, one {# run in progress uses or makes it. It will close against this lot.} other {# runs in progress use or make it. Each will close against this lot.}}',
            },
            { count: question.runCount },
          )}
    </Typography>
  );
}
