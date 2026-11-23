import {
  Alert,
  Box,
  Chip,
  Link,
  Paper,
  Skeleton,
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
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import type {
  LotMatch,
  LotRecipient,
  LotTrace,
  MovedOnLot,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { CardLine } from '../components/card-line';
import { ExpiryChip } from '../components/expiry-chip';
import { ExportButton } from '../components/export-button';
import { ListTable } from '../components/list-table';
import { NAME_COLUMN } from '../components/name-column';
import { PageHeader } from '../components/page-header';
import { Reference } from '../components/reference';
import { TableOrCards } from '../components/table-or-cards';
import { LotCostPanel } from '../costs/lot-cost-panel';
import { LoadFailure } from '../errors/load-failure';
import { api, messageFor } from '../lib/api';
import { isZero } from '../lib/decimal';
import {
  displayQuantity,
  formatDate,
  formatDay,
  NO_VALUE,
  SEPARATOR,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { useRecordOpened } from '../lib/recent';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useExpiryStatus } from '../lib/use-expiry-status';
import { useResource } from '../lib/use-resource';
import { useRowReturn } from '../lib/use-row-return';
import { LicenceAtRelease } from '../licences/licence-at-release';
import { displayWithUnit } from '../products/units';
import { rem } from '../theme/rem';
import { COLOR_OF_TONE } from '../theme/status';
import { lotExpiryPart } from './lot-expiry';
import { SupplierLotLine } from './lot-marks';
import { inSentence, reasonDetailLabel } from './movement-reasons';
import { movementsPath } from './movements-path';
import { PlacesHidden } from './places-hidden';
import { placeName } from './stock-places';

/**
 * Finding a lot by any part of its code or its supplier's lot (ADR-044,
 * amended by ADR-094, R6), each match naming its supplier's lot (S10).
 *
 * A recall usually begins as a code read off a label, with no product
 * attached, so this searches every product. Links elsewhere in the app that
 * know only a code — shipments, returns — land here with ?code= filled in,
 * and a single exact match goes straight to its trace.
 */
export function LotSearchPage() {
  const intl = useIntl();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const code = params.get('code') ?? '';
  const [typed, setTyped] = useState(code);
  const [matches, setMatches] = useState<LotMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim()) return;

    let ignore = false;

    void api<LotMatch[]>(
      `/stock/lots/search?${new URLSearchParams({ code }).toString()}`,
    )
      .then((rows) => {
        if (ignore) return;

        // Arriving from a link with an exact code: one answer, so no list.
        const exact = rows.filter(
          (row) => row.code.toLowerCase() === code.toLowerCase(),
        );
        if (exact.length === 1) {
          void navigate(`/lots/${exact[0].id}`, { replace: true });
          return;
        }

        setMatches(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [code, navigate]);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'inventory.trace.title',
          defaultMessage: 'Trace a lot',
        })}
      />

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          setMatches(null);
          // The link's state kept, so Back stays after a search (#341).
          setParams(typed.trim() ? { code: typed.trim() } : {}, {
            state: location.state,
          });
        }}
      >
        <TextField
          id="lot-code"
          label={intl.formatMessage({
            id: 'inventory.trace.lotOrSupplierLot',
            defaultMessage: 'Lot code or supplier’s lot',
          })}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          helperText={intl.formatMessage({
            id: 'inventory.trace.lotOrSupplierLot.help',
            defaultMessage:
              'Any part of either works — the batch number is usually enough. Press Enter to search.',
          })}
          sx={{ maxWidth: rem(420) }}
          fullWidth
        />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {matches?.length === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.trace.noMatch',
              defaultMessage: 'No lot contains “{code}”.',
            },
            { code: <Reference>{code}</Reference> },
          )}
        </Typography>
      )}

      {!!matches?.length && (
        <Paper variant="outlined">
          <ListTable
            label={intl.formatMessage({
              id: 'inventory.trace.title',
              defaultMessage: 'Trace a lot',
            })}
            size="small"
          >
            <TableHead>
              <TableRow>
                <TableCell {...NAME_COLUMN}>
                  {intl.formatMessage({
                    id: 'inventory.lot',
                    defaultMessage: 'Lot',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'products.sku',
                    defaultMessage: 'Code',
                  })}
                </TableCell>
                <TableCell>
                  {intl.formatMessage({
                    id: 'inventory.lot.expires',
                    defaultMessage: 'Expires',
                  })}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {matches.map((lot) => (
                <TableRow key={lot.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/lots/${lot.id}`}>
                      {lot.code}
                    </Link>
                    {/* The supplier's lot, which finds it too, as the
                        lookup's lot row reads it (ADR-094, S10). */}
                    <SupplierLotLine
                      isAssigned={lot.isAssigned}
                      supplierLot={lot.supplierLot}
                    />
                  </TableCell>
                  <TableCell>
                    <Reference>{lot.sku}</Reference>
                  </TableCell>
                  <TableCell>
                    <ExpiryChip expiresAt={lot.expiresAt} expiry={lot.expiry} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ListTable>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * One lot's whole story (ADR-044): where it is, where it came from, what it
 * was made from and went into, and — the recall list — everyone who received
 * it or anything made from it.
 *
 * Every lot, run and order on the page links onward, so following a chain is
 * clicking rather than searching; a partner, order or run the reader may not
 * open reads as text (ADR-080). Nothing here is editable: it is a reading of
 * the ledger, and correcting anything is done where the movement was made.
 */
export function LotTracePage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const can = useCan();

  const {
    data: trace,
    error,
    failure,
    loading,
    reload,
  } = useResource<LotTrace>(`/stock/lots/${id!}/trace`);
  // Remembered as recently opened, once loaded (ADR-058).
  useRecordOpened('lot', id, trace !== null && trace !== undefined);

  const showSkeleton = useDelayedFlag(loading);
  const receivedBy = useRef<HTMLHeadingElement>(null);
  // Carried from the list to the lot's own page, beside its title (#479).
  const expiry = useExpiryStatus(trace?.lot.expiresAt ?? null);

  if (error) {
    return (
      <LoadFailure
        failure={failure}
        message={error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.lot',
          defaultMessage: 'This lot doesn’t exist',
        })}
        list={{
          to: '/lots',
          label: intl.formatMessage({
            id: 'layout.nav.trace',
            defaultMessage: 'Trace a lot',
          }),
        }}
        onRetry={() => void reload()}
      />
    );
  }
  if (!trace) return showSkeleton ? <Skeleton height={320} /> : null;

  const opens: Opens = {
    partners: can('partners.view'),
    orders: can('orders.view'),
    runs: can('production.view'),
  };
  const unknown = trace.recipients.filter((row) => !row.partnerName);

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <PageHeader
          crumbs={[
            {
              label: intl.formatMessage({
                id: 'inventory.trace.title',
                defaultMessage: 'Trace a lot',
              }),
              to: '/lots',
            },
          ]}
          title={intl.formatMessage(
            { id: 'inventory.lot.title', defaultMessage: 'Lot {code}' },
            { code: trace.lot.code },
          )}
          status={
            expiry
              ? { label: expiry.label, color: COLOR_OF_TONE[expiry.tone] }
              : undefined
          }
          // The item's name its way to the item's page, with products.view
          // (review 6).
          subtitle={[
            trace.lot.sku,
            can('products.view') ? (
              <Link
                key="item"
                component={RouterLink}
                to={`/items/${trace.lot.productId}`}
                state={OFFER_BACK}
              >
                {trace.lot.description}
              </Link>
            ) : (
              trace.lot.description
            ),
            // Its expiry, or "expiry to add" (ADR-094, D2); then its
            // supplier's lot, the code it is also found by (R6).
            lotExpiryPart(trace.lot, intl),
            trace.lot.supplierLot
              ? intl.formatMessage(
                  {
                    id: 'inventory.lot.supplierLotIs',
                    defaultMessage: 'Supplier’s lot {code}',
                  },
                  { code: trace.lot.supplierLot },
                )
              : trace.lot.isAssigned &&
                intl.formatMessage({
                  id: 'inventory.lot.supplierLotToAdd',
                  defaultMessage: 'Supplier’s lot to add',
                }),
          ]
            .filter(Boolean)
            .flatMap((part, index) =>
              index === 0 ? [part] : [SEPARATOR, part],
            )}
        />

        {/* The way on to its movements, as the item's page has one (review
            6): its item and the lot, so the stock card counts this lot
            (85a, 95a), with no days, the lot's whole life (132b). */}
        {can('stock.view') && (
          <Link
            component={RouterLink}
            to={movementsPath({
              variantId: trace.lot.variantId,
              lotId: trace.lot.id,
            })}
            state={OFFER_BACK}
            sx={{ alignSelf: 'flex-start' }}
          >
            {intl.formatMessage({
              id: 'inventory.trace.allMovements',
              defaultMessage: 'All movements of this lot',
            })}
          </Link>
        )}

        {/* How many the recall must reach, at the top, the list itself
            being the page's last section (#620). */}
        <ReceivedCount
          recipients={trace.recipients}
          // Focus brings it into view, clear of the top bar by its
          // scroll margin.
          onShow={() => receivedBy.current?.focus()}
        />
      </Stack>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.whereNow',
          defaultMessage: 'Where it is now',
        })}
      >
        {trace.balances.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.whereNow.empty',
              defaultMessage: 'None of this lot is on hand anywhere.',
            })}
          </Empty>
        ) : !can('locations.view') ? (
          // No place named without locations.view (ADR-093, 96a): the two
          // sums the server sends, with no Location column, and why
          // (review 3, 115).
          <Stack spacing={1}>
            <Grid
              head={[
                intl.formatMessage({
                  id: 'inventory.trace.usable',
                  defaultMessage: 'Usable',
                }),
                intl.formatMessage({
                  id: 'inventory.trace.notUsable',
                  defaultMessage: 'Not usable',
                }),
              ]}
              rows={[
                [trace.usable, trace.notUsable].map((quantity) =>
                  displayWithUnit(quantity, trace.lot.unitOfMeasure, intl),
                ),
              ]}
              alignRight={[0, 1]}
            />
            <PlacesHidden />
          </Stack>
        ) : (
          <Grid
            head={[
              intl.formatMessage({
                id: 'inventory.location',
                defaultMessage: 'Location',
              }),
              intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              }),
            ]}
            rows={trace.balances.map((row) => [
              <>
                {/* Its whole path, its warehouse first (#639). */}
                {placeName(row)}
                {!row.isAvailable && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'locations.notAvailable',
                      defaultMessage: 'Not available',
                    })}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                )}
              </>,
              displayWithUnit(row.quantity, trace.lot.unitOfMeasure, intl),
            ])}
            alignRight={[1]}
          />
        )}

        {trace.movedOnTo.length > 0 && (
          <MovedOnTo
            lots={trace.movedOnTo}
            unitOfMeasure={trace.lot.unitOfMeasure}
            seesPlaces={can('locations.view')}
          />
        )}
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.cameFrom',
          defaultMessage: 'Where it came from',
        })}
      >
        {trace.sources.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.cameFrom.empty',
              defaultMessage:
                'No receipt or production is recorded for this lot. It may have been counted into stock by a correction.',
            })}
          </Empty>
        ) : (
          <Stack spacing={1}>
            {trace.sources.map((source) => (
              <Typography
                key={[
                  source.kind,
                  source.reasonDetail,
                  source.orderId ?? source.runId ?? source.fromLotId,
                  source.partnerId,
                ].join('-')}
              >
                <FormattedMessage
                  id="inventory.trace.sourceLine"
                  defaultMessage="{source} — {amount}, {date}"
                  values={{
                    source: (
                      <SourceText
                        source={source}
                        opens={opens}
                        linkToLicences={can('product_licences.view')}
                      />
                    ),
                    amount: displayWithUnit(
                      source.quantity,
                      trace.lot.unitOfMeasure,
                      intl,
                    ),
                    date: formatDate(source.at),
                  }}
                />
              </Typography>
            ))}
          </Stack>
        )}
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.madeFrom',
          defaultMessage: 'Made from',
        })}
      >
        <RelatedTable
          rows={trace.madeFrom}
          opens={opens}
          empty={intl.formatMessage({
            id: 'inventory.trace.madeFrom.empty',
            defaultMessage: 'Not made in a run here — received, not produced.',
          })}
        />
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.wentInto',
          defaultMessage: 'Went into',
        })}
      >
        <RelatedTable
          rows={trace.wentInto}
          opens={opens}
          empty={intl.formatMessage({
            id: 'inventory.trace.wentInto.empty',
            defaultMessage: 'Not used in any run.',
          })}
        />
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.receivedBy',
          defaultMessage: 'Who received it',
        })}
        headingRef={receivedBy}
        // The recall list as a file, for a recall letter (ADR-044, amended).
        action={
          trace.recipients.length > 0 && (
            <ExportButton
              path={`/stock/lots/${trace.lot.id}/recipients/export`}
            />
          )
        }
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'inventory.trace.receivedBy.intro',
            defaultMessage:
              'This lot and everything made from it: the list a recall has to reach.',
          })}
        </Typography>

        {unknown.length > 0 && (
          <Alert severity="warning">
            {intl.formatMessage({
              id: 'inventory.trace.unknownRecipients',
              defaultMessage:
                'Some left with no recipient on record — shipped without an order, or sampled without a name. They are listed below with no partner.',
            })}
          </Alert>
        )}

        {trace.recipients.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.receivedBy.empty',
              defaultMessage: 'Nothing from this lot has left the business.',
            })}
          </Empty>
        ) : (
          <Recipients
            key={trace.lot.id}
            lotId={trace.lot.id}
            rows={trace.recipients}
            opens={opens}
          />
        )}
      </Section>

      {can('costs.view') && <LotCostPanel lotId={trace.lot.id} />}
    </Stack>
  );
}

/**
 * Where its stock moved on to (ADR-094, S9): each lot reached from this
 * one by moves alone, its code a link to its page, with all it holds now
 * as Where it is now reads this lot: by place for a reader who may see
 * places, else usable and not; a lot emptied since holds nothing. So a
 * recall reading this page finds the stock still on hand under another
 * code.
 */
function MovedOnTo({
  lots,
  unitOfMeasure,
  seesPlaces,
}: {
  lots: LotTrace['movedOnTo'];
  unitOfMeasure: string;
  seesPlaces: boolean;
}) {
  const intl = useIntl();
  const amount = (quantity: string) =>
    displayWithUnit(quantity, unitOfMeasure, intl);
  const lotLink = (lot: MovedOnLot) => (
    <Link component={RouterLink} to={`/lots/${lot.lotId}`}>
      <Reference>{lot.code}</Reference>
    </Link>
  );
  const lotHead = intl.formatMessage({
    id: 'inventory.lot',
    defaultMessage: 'Lot',
  });

  return (
    <Stack spacing={1} sx={{ pt: 1 }}>
      <Typography component="h3" sx={{ fontWeight: 600 }}>
        {intl.formatMessage({
          id: 'inventory.trace.movedOnTo',
          defaultMessage: 'Moved on to',
        })}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'inventory.trace.movedOnTo.intro',
          defaultMessage:
            'Lots part of this one was moved into, with all each holds now: a recall reaches these too.',
        })}
      </Typography>
      {seesPlaces ? (
        <Grid
          head={[
            lotHead,
            intl.formatMessage({
              id: 'inventory.location',
              defaultMessage: 'Location',
            }),
            intl.formatMessage({
              id: 'inventory.quantity',
              defaultMessage: 'Quantity',
            }),
          ]}
          rows={lots.flatMap((lot) =>
            lot.balances.length === 0
              ? [[lotLink(lot), NO_VALUE, amount('0')]]
              : lot.balances.map((row) => [
                  lotLink(lot),
                  <>
                    {placeName(row)}
                    {!row.isAvailable && (
                      <Chip
                        label={intl.formatMessage({
                          id: 'locations.notAvailable',
                          defaultMessage: 'Not available',
                        })}
                        size="small"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </>,
                  amount(row.quantity),
                ]),
          )}
          alignRight={[2]}
        />
      ) : (
        <Grid
          head={[
            lotHead,
            intl.formatMessage({
              id: 'inventory.trace.usable',
              defaultMessage: 'Usable',
            }),
            intl.formatMessage({
              id: 'inventory.trace.notUsable',
              defaultMessage: 'Not usable',
            }),
          ]}
          rows={lots.map((lot) => [
            lotLink(lot),
            amount(lot.usable),
            amount(lot.notUsable),
          ])}
          alignRight={[1, 2]}
        />
      )}
    </Stack>
  );
}

/**
 * How many the recall must reach, under the lot's title (#620): the
 * partners who received it or anything made from it or moved out of it,
 * and whether some left with no recipient recorded; pressed, the list
 * itself, its heading focused.
 */
function ReceivedCount({
  recipients,
  onShow,
}: {
  recipients: LotTrace['recipients'];
  onShow: () => void;
}) {
  const intl = useIntl();

  if (recipients.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'inventory.trace.receivedBy.empty',
          defaultMessage: 'Nothing from this lot has left the business.',
        })}
      </Typography>
    );
  }

  const partners = new Set(
    recipients.flatMap((row) => (row.partnerId ? [row.partnerId] : [])),
  ).size;
  const unnamed = recipients.some((row) => !row.partnerId);
  const words =
    partners === 0
      ? intl.formatMessage({
          id: 'inventory.trace.receivedCount.unnamed',
          defaultMessage: 'Left with no recipient recorded',
        })
      : unnamed
        ? intl.formatMessage(
            {
              id: 'inventory.trace.receivedCount.some',
              defaultMessage:
                'Received by {count, plural, one {# partner} other {# partners}}, and some with no recipient recorded',
            },
            { count: partners },
          )
        : intl.formatMessage(
            {
              id: 'inventory.trace.receivedCount',
              defaultMessage:
                'Received by {count, plural, one {# partner} other {# partners}}',
            },
            { count: partners },
          );

  return (
    <Link
      component="button"
      type="button"
      onClick={onShow}
      sx={{ alignSelf: 'flex-start', textAlign: 'left' }}
    >
      {words}
    </Link>
  );
}

/**
 * The recall list (ADR-044): each partner by order and the lot they
 * received, Through naming it where it is not this lot, one made from it
 * or one its stock moved into (ADR-094, R21); a table from 600 px and
 * cards below, each with what it received (#617). Back from a lot a row
 * came through puts focus on that row's link again.
 */
function Recipients({
  lotId,
  rows,
  opens,
}: {
  lotId: string;
  rows: LotTrace['recipients'];
  opens: Opens;
}) {
  const intl = useIntl();
  const { rowReturn } = useRowReturn();
  // A recipient's order with no reference of its own.
  const orderWord = intl.formatMessage({
    id: 'inventory.trace.order',
    defaultMessage: 'Order',
  });
  const HEADS = {
    who: intl.formatMessage({
      id: 'inventory.trace.who',
      defaultMessage: 'Who',
    }),
    order: orderWord,
    through: intl.formatMessage({
      id: 'inventory.trace.throughLot',
      defaultMessage: 'Through lot',
    }),
    shipped: intl.formatMessage({
      id: 'inventory.trace.shipped',
      defaultMessage: 'Shipped',
    }),
    sampled: intl.formatMessage({
      id: 'inventory.trace.sampled',
      defaultMessage: 'Sampled',
    }),
    returned: intl.formatMessage({
      id: 'inventory.trace.returned',
      defaultMessage: 'Returned',
    }),
    leftOn: intl.formatMessage({
      id: 'inventory.trace.leftOn',
      defaultMessage: 'Date',
    }),
  };
  const keyOf = (row: LotRecipient) =>
    [row.partnerId, row.orderId, row.lotId].join('-');

  const who = (row: LotRecipient) =>
    row.partnerId ? (
      <Onward to={`/partners/${row.partnerId}`} open={opens.partners}>
        {row.partnerName}
      </Onward>
    ) : (
      <Typography component="span" sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'inventory.trace.noRecipient',
          defaultMessage: 'No recipient recorded',
        })}
      </Typography>
    );
  const order = (row: LotRecipient) =>
    row.orderId ? (
      <Onward to={`/orders/${row.orderId}`} open={opens.orders}>
        {row.isSampleOrder
          ? intl.formatMessage(
              {
                id: 'inventory.trace.sampleOrder',
                defaultMessage: '{reference} (sample)',
              },
              {
                reference: row.orderNumber ? (
                  <Reference>{row.orderNumber}</Reference>
                ) : (
                  orderWord
                ),
              },
            )
          : (row.orderNumber ?? orderWord)}
      </Onward>
    ) : (
      NO_VALUE
    );
  const through = (row: LotRecipient) =>
    row.lotId === lotId ? (
      NO_VALUE
    ) : (
      <Link component={RouterLink} to={`/lots/${row.lotId}`}>
        <Reference>{row.lotCode}</Reference>
      </Link>
    );

  return (
    <TableOrCards
      loading={false}
      table={
        <Paper variant="outlined">
          <TableContainer>
            <Table
              size="small"
              aria-label={intl.formatMessage({
                id: 'inventory.trace.receivedBy',
                defaultMessage: 'Who received it',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{HEADS.who}</TableCell>
                  <TableCell>{HEADS.order}</TableCell>
                  <TableCell>{HEADS.through}</TableCell>
                  <TableCell align="right">{HEADS.shipped}</TableCell>
                  <TableCell align="right">{HEADS.sampled}</TableCell>
                  <TableCell align="right">{HEADS.returned}</TableCell>
                  <TableCell>{HEADS.leftOn}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={keyOf(row)} {...rowReturn(keyOf(row))}>
                    <TableCell>{who(row)}</TableCell>
                    <TableCell>{order(row)}</TableCell>
                    <TableCell>{through(row)}</TableCell>
                    <TableCell align="right">
                      {displayQuantity(row.shipped)}
                    </TableCell>
                    <TableCell align="right">
                      {displayQuantity(row.sampled)}
                    </TableCell>
                    <TableCell align="right">
                      {displayQuantity(row.returned)}
                    </TableCell>
                    <TableCell>
                      {row.leftOn ? formatDay(row.leftOn) : NO_VALUE}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      }
      cards={
        <Paper variant="outlined">
          <Stack
            component="ul"
            sx={{ m: 0, p: 0 }}
            aria-label={intl.formatMessage({
              id: 'inventory.trace.receivedBy',
              defaultMessage: 'Who received it',
            })}
          >
            {rows.map((row) => (
              <Box
                component="li"
                key={keyOf(row)}
                {...rowReturn(keyOf(row))}
                sx={{
                  listStyle: 'none',
                  p: 2,
                  '& + &': { borderTop: 1, borderColor: 'divider' },
                }}
              >
                <Stack spacing={1}>
                  <Typography sx={{ fontWeight: 600 }}>{who(row)}</Typography>
                  {row.orderId && (
                    <CardLine label={HEADS.order}>{order(row)}</CardLine>
                  )}
                  {row.lotId !== lotId && (
                    <CardLine label={HEADS.through}>{through(row)}</CardLine>
                  )}
                  {/* What it received, the numbers that matter alone. */}
                  {(
                    [
                      ['shipped', row.shipped],
                      ['sampled', row.sampled],
                      ['returned', row.returned],
                    ] as const
                  )
                    .filter(([, quantity]) => !isZero(quantity))
                    .map(([head, quantity]) => (
                      <CardLine key={head} label={HEADS[head]}>
                        {displayQuantity(quantity)}
                      </CardLine>
                    ))}
                  {row.leftOn && (
                    <CardLine label={HEADS.leftOn}>
                      {formatDay(row.leftOn)}
                    </CardLine>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      }
    />
  );
}

function RelatedTable({
  rows,
  opens,
  empty,
}: {
  rows: LotTrace['madeFrom'];
  opens: Opens;
  empty: string;
}) {
  const intl = useIntl();

  if (rows.length === 0) return <Empty>{empty}</Empty>;

  return (
    <Grid
      head={[
        intl.formatMessage({ id: 'inventory.lot', defaultMessage: 'Lot' }),
        intl.formatMessage({ id: 'products.sku', defaultMessage: 'Code' }),
        intl.formatMessage({
          id: 'inventory.trace.stepsAway',
          defaultMessage: 'Steps away',
        }),
        intl.formatMessage({
          id: 'inventory.trace.throughRun',
          defaultMessage: 'Through run',
        }),
      ]}
      rows={rows.map((row) => [
        <Link component={RouterLink} to={`/lots/${row.lotId}`}>
          {row.code}
        </Link>,
        row.sku,
        String(row.depth),
        <Onward to={`/production/${row.runId}`} open={opens.runs}>
          {row.runReference ??
            intl.formatMessage({
              id: 'inventory.trace.run',
              defaultMessage: 'Run',
            })}
        </Onward>,
      ])}
      alignRight={[2]}
    />
  );
}

/**
 * Where a lot came from, as one phrase the line above wraps with its
 * quantity and date: made in a run, perhaps under a licence; received on
 * an order; received with neither, from whom and why where the receipt
 * says (ADR-094, R11, E2); moved in from another lot, the code's stock
 * on hand as its lot tracking started, or stock back from before then
 * (R21). Each a whole sentence in the catalogue, with its links as tags,
 * so a language can put them where its grammar needs them. A kind this
 * tab does not know says only that stock came in (D4).
 */
function SourceText({
  source,
  opens,
  linkToLicences,
}: {
  source: LotTrace['sources'][number];
  opens: Opens;
  linkToLicences: boolean;
}) {
  const intl = useIntl();

  if (source.kind === 'production') {
    const reference = source.runReference ? (
      <Reference>{source.runReference}</Reference>
    ) : (
      intl.formatMessage({
        id: 'inventory.trace.noReference',
        defaultMessage: 'without a reference',
      })
    );
    const run = (chunks: ReactNode[]) => (
      <Onward
        underline="always"
        to={`/production/${source.runId!}`}
        open={opens.runs}
      >
        {chunks}
      </Onward>
    );

    return source.licenceNumber ? (
      <FormattedMessage
        id="inventory.trace.madeInRunUnder"
        defaultMessage="Made in run <run>{reference}</run> under {licence}"
        values={{
          reference,
          run,
          licence: (
            <LicenceAtRelease run={source} linkToLicences={linkToLicences} />
          ),
        }}
      />
    ) : (
      <FormattedMessage
        id="inventory.trace.madeInRun"
        defaultMessage="Made in run <run>{reference}</run>"
        values={{ reference, run }}
      />
    );
  }

  if (source.kind === 'lot_change') {
    if (source.fromLotId && source.fromLotCode) {
      return (
        <FormattedMessage
          id="inventory.trace.movedInFrom"
          defaultMessage="Moved in from lot {code}"
          values={{
            code: (
              <Link
                component={RouterLink}
                to={`/lots/${source.fromLotId}`}
                underline="always"
              >
                <Reference>{source.fromLotCode}</Reference>
              </Link>
            ),
          }}
        />
      );
    }
    if (source.reasonDetail === 'lots_started') {
      return (
        <>
          {intl.formatMessage({
            id: 'inventory.trace.trackingStarted',
            defaultMessage: 'Stock on hand when lot tracking started',
          })}
        </>
      );
    }
    if (source.reasonDetail === 'from_before') {
      return (
        <>
          {intl.formatMessage({
            id: 'inventory.trace.fromBefore',
            defaultMessage: 'Back from before lot tracking',
          })}
        </>
      );
    }
  }

  if (source.kind !== 'receipt') {
    return (
      <>
        {intl.formatMessage({
          id: 'inventory.trace.cameIn',
          defaultMessage: 'Came into this lot',
        })}
      </>
    );
  }

  if (source.orderId) {
    return (
      <FormattedMessage
        id="inventory.trace.receivedFrom"
        defaultMessage="Received from {supplier} on <order>{reference}</order>"
        values={{
          supplier: source.supplierName,
          reference: source.orderNumber ? (
            <Reference>{source.orderNumber}</Reference>
          ) : (
            intl.formatMessage({
              id: 'inventory.trace.anOrder',
              defaultMessage: 'an order',
            })
          ),
          order: (chunks: ReactNode[]) => (
            <Onward
              underline="always"
              to={`/orders/${source.orderId}`}
              open={opens.orders}
            >
              {chunks}
            </Onward>
          ),
        }}
      />
    );
  }

  // With no order: from whom, a link for whoever may open partners, and
  // why, "opening stock" (ADR-094, R11, E2).
  const why = source.reasonDetail
    ? inSentence(reasonDetailLabel(source.reasonDetail, intl), intl)
    : null;
  if (source.partnerId && source.supplierName) {
    const partner = (
      <Onward
        underline="always"
        to={`/partners/${source.partnerId}`}
        open={opens.partners}
      >
        {source.supplierName}
      </Onward>
    );
    return why ? (
      <FormattedMessage
        id="inventory.trace.receivedFromWhy"
        defaultMessage="Received from {partner} with no order: {why}"
        values={{ partner, why }}
      />
    ) : (
      <FormattedMessage
        id="inventory.trace.receivedFromNoOrder"
        defaultMessage="Received from {partner} with no order"
        values={{ partner }}
      />
    );
  }
  if (why) {
    return (
      <>
        {intl.formatMessage(
          {
            id: 'inventory.trace.receivedWhy',
            defaultMessage: 'Received with no order: {why}',
          },
          { why },
        )}
      </>
    );
  }

  return (
    <>
      {intl.formatMessage({
        id: 'inventory.trace.receivedNoOrder',
        defaultMessage: 'Received with no order on record',
      })}
    </>
  );
}

/** Which of the pages a trace leads to the reader may open (ADR-080). */
type Opens = { partners: boolean; orders: boolean; runs: boolean };

/**
 * A partner, order or run, as a link for whoever may open it and as its
 * words alone for whoever may not: a link that leads only to a refusal
 * promises what the page cannot give.
 */
function Onward({
  to,
  open,
  underline,
  children,
}: {
  to: string;
  open: boolean;
  underline?: 'always';
  children: ReactNode;
}) {
  if (!open) return <>{children}</>;

  return (
    <Link component={RouterLink} to={to} underline={underline}>
      {children}
    </Link>
  );
}

function Section({
  title,
  action,
  headingRef,
  children,
}: {
  title: string;
  /** The section's own action, beside its heading. */
  action?: ReactNode;
  /** For a way to it from above, which focuses its heading. */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Typography
          variant="h6"
          component="h2"
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          sx={{ scrollMarginTop: (theme) => theme.spacing(10) }}
        >
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Stack>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {children}
    </Typography>
  );
}

/** A plain table: every section here is a short list of facts. */
function Grid({
  head,
  rows,
  alignRight = [],
}: {
  head: string[];
  rows: ReactNode[][];
  alignRight?: number[];
}) {
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {head.map((label, index) => (
                <TableCell
                  key={label}
                  align={alignRight.includes(index) ? 'right' : 'left'}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((cells, rowIndex) => (
              <TableRow key={rowIndex}>
                {cells.map((cell, index) => (
                  <TableCell
                    key={index}
                    align={alignRight.includes(index) ? 'right' : 'left'}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
