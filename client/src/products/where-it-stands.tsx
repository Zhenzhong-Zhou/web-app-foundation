import {
  Box,
  Button,
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
  Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { WhomToAskRead } from '../account/whom-to-ask';
import type {
  CodeStanding,
  ProductDetail,
  ProductStock,
  StockPile,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { ExpiryChip } from '../components/expiry-chip';
import { ListError } from '../components/list-error';
import { LotLink } from '../components/lot-link';
import { Reference } from '../components/reference';
import { TableOrCards } from '../components/table-or-cards';
import { MoveStockDialog } from '../inventory/move-stock-dialog';
import { PlacePath } from '../inventory/place-path';
import {
  type ReorderOpening,
  ReorderPointDialog,
} from '../inventory/reorder-point-dialog';
import { fieldQuantity } from '../inventory/reorder-points';
import { LeftLine, ReorderStatusChip } from '../inventory/reorder-status';
import { isZero } from '../lib/decimal';
import { displayQuantity, formatDay, NO_VALUE, SEPARATOR } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useLocations } from '../lib/use-locations';
import { useResource } from '../lib/use-resource';
import { leavesOf } from '../locations/tree';
import { fillState } from '../orders/order-fill';
import { CreateRunDialog } from '../production/create-run-dialog';
import { rem } from '../theme/rem';
import { TYPE } from '../theme/tokens';
import { NO_RECEIVE } from './receive-line';
import { displayWithUnit } from './units';

/** The part of Where it stands a link opens: Stock's rows and Items'. */
const PARTS = ['#stock', '#held'] as const;

/** A main action the role cannot use: whom to ask (the design language). */
const NO_BUY = defineMessages({
  ask: {
    id: 'products.stock.buyAsk',
    defaultMessage:
      'Your role does not include buying. To do more, ask {names}.',
  },
  none: {
    id: 'products.stock.buyNone',
    defaultMessage: 'Your role does not include buying.',
  },
});

const NO_MAKE = defineMessages({
  ask: {
    id: 'products.stock.makeAsk',
    defaultMessage:
      'Your role does not include planning runs. To do more, ask {names}.',
  },
  none: {
    id: 'products.stock.makeNone',
    defaultMessage: 'Your role does not include planning runs.',
  },
});

const NO_POINT = defineMessages({
  ask: {
    id: 'products.stock.pointAsk',
    defaultMessage:
      'Your role does not include setting reorder points. To do more, ask {names}.',
  },
  none: {
    id: 'products.stock.pointNone',
    defaultMessage: 'Your role does not include setting reorder points.',
  },
});

const WORDS = defineMessages({
  title: { id: 'products.stock.title', defaultMessage: 'Where it stands' },
  onHand: { id: 'common.onHand', defaultMessage: 'On hand' },
  free: { id: 'inventory.stock.free', defaultMessage: 'Free' },
  held: { id: 'inventory.stock.held', defaultMessage: 'Held' },
  coming: { id: 'inventory.stock.coming', defaultMessage: 'Coming' },
  left: { id: 'products.stock.left', defaultMessage: 'Left' },
  place: { id: 'inventory.location', defaultMessage: 'Location' },
  lot: { id: 'inventory.lot', defaultMessage: 'Lot' },
  expires: { id: 'products.stock.expires', defaultMessage: 'Expires' },
  move: { id: 'inventory.actions.move', defaultMessage: 'Move' },
  actions: { id: 'common.actions', defaultMessage: 'Actions' },
});

/**
 * Where it stands (ADR-093, R8): the item's page's first section under
 * its title, for a reader with stock.view. Per code, the low first, as
 * the server orders them: its status and "10 left · reorder at 36"; On
 * hand with what is not usable and why; Free; Held with its orders; Coming
 * with its purchases and runs; Left with its sum in words; and By place
 * and lot. Each part is drawn only when the answer has it, since the
 * server leaves out what the reader may not see (ADR-080); each action
 * by its own permission, a main action the role cannot use naming whom to
 * ask. `#stock` and `#held` in the address put focus on the section, or
 * on Held, as Stock's "10 left" and "20 short" open it.
 */
export function WhereItStands({ product }: { product: ProductDetail }) {
  const can = useCan();
  if (!can('stock.view')) return null;
  return <Standing product={product} />;
}

function Standing({ product }: { product: ProductDetail }) {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { data, error, loading, reload } = useResource<ProductStock>(
    `/products/${product.id}/stock`,
  );
  const showSkeleton = useDelayedFlag(loading);
  const [opening, setOpening] = useState<ReorderOpening | null>(null);
  const [planning, setPlanning] = useState<CodeStanding | null>(null);
  const [moving, setMoving] = useState<StockPile | null>(null);
  // The places read once Move first opens, then kept, never on a visit
  // that moves nothing (review 47); the dialog waits for their answer.
  const [movedOnce, setMovedOnce] = useState(false);
  const { locations, answered: placesAnswered } = useLocations(
    movedOnce && can('stock.move') && can('locations.view'),
  );

  const codes = (data?.codes ?? []).filter(
    (code) =>
      code.isActive ||
      !isZero(code.onHand) ||
      !isZero(code.coming) ||
      !isZero(code.stillNeeded),
  );
  // Stock's "20 short" opens Held: the code short, else the one holding.
  const heldAt =
    codes.find((code) => !isZero(code.short)) ??
    codes.find((code) => !isZero(code.held)) ??
    codes[0];

  // Arrived at a part: focus on it once it is drawn, once per arrival.
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    if (!data || arrived.current === hash) return;
    if (!(PARTS as readonly string[]).includes(hash)) return;
    arrived.current = hash;
    document.getElementById(hash.slice(1))?.focus();
  }, [data, hash]);

  if (loading) {
    return showSkeleton ? <Skeleton height={160} /> : null;
  }
  if (error && !data) {
    return <ListError error={error} onRetry={() => void reload()} />;
  }
  if (codes.length === 0) return null;

  const handlers: Handlers = {
    onPoint: (code) =>
      setOpening({
        kind: 'find',
        item: {
          variantId: code.variantId,
          sku: code.sku,
          productName: product.displayName,
          variantName: code.variantName,
          unitOfMeasure: code.unitOfMeasure,
        },
      }),
    onBuy: (code) =>
      void navigate('/orders/new', {
        state: fillState({
          lines: [{ variantId: code.variantId, quantity: code.suggestion! }],
        }),
      }),
    onMake: setPlanning,
    onMove: (pile) => {
      setMovedOnce(true);
      setMoving(pile);
    },
  };

  return (
    <Box component="section" aria-labelledby="stock">
      <Typography
        id="stock"
        tabIndex={-1}
        variant="h6"
        component="h2"
        sx={{ mb: 2, outline: 'none' }}
      >
        {intl.formatMessage(WORDS.title)}
      </Typography>

      <Stack spacing={3}>
        {codes.map((code) => (
          <CodeBlock
            key={code.variantId}
            code={code}
            titled={codes.length > 1}
            heldId={code === heldAt ? 'held' : undefined}
            handlers={handlers}
          />
        ))}
      </Stack>

      {opening && (
        <ReorderPointDialog
          opening={opening}
          onClose={() => setOpening(null)}
          onSaved={() => {
            setOpening(null);
            void reload();
          }}
        />
      )}

      {planning && (
        <CreateRunDialog
          open
          canSeePartners={can('partners.view')}
          filled={{
            outputVariantId: planning.variantId,
            quantityPlanned: fieldQuantity(planning.suggestion!),
            note: intl.formatMessage({
              id: 'products.stock.runFilled',
              defaultMessage:
                'Filled from Where it stands: its suggested order.',
            }),
          }}
          onClose={() => setPlanning(null)}
          onCreated={() => void reload()}
        />
      )}

      {moving && placesAnswered && (
        <MoveStockDialog
          mode="transfer"
          row={moving}
          locations={leavesOf(locations).filter((each) => each.isActive)}
          canSeePartners={can('partners.view')}
          onClose={() => setMoving(null)}
          onMoved={reload}
        />
      )}
    </Box>
  );
}

interface Handlers {
  onPoint: (code: CodeStanding) => void;
  onBuy: (code: CodeStanding) => void;
  onMake: (code: CodeStanding) => void;
  onMove: (pile: StockPile) => void;
}

/** One code: its status, its figures with what is behind them, its lots. */
function CodeBlock({
  code,
  titled,
  heldId,
  handlers,
}: {
  code: CodeStanding;
  titled: boolean;
  heldId?: string;
  handlers: Handlers;
}) {
  const intl = useIntl();
  const qty = (value: string) =>
    displayWithUnit(value, code.unitOfMeasure, intl);
  const empty =
    isZero(code.onHand) &&
    isZero(code.coming) &&
    isZero(code.stillNeeded) &&
    code.reorderPoint === null;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        {titled && (
          // The name first, its code grey (the design language's Rows).
          <Typography component="h3" sx={{ fontWeight: 600 }}>
            {code.variantName && (
              <>
                {code.variantName}
                {SEPARATOR}
              </>
            )}
            <Box
              component="span"
              sx={{ color: 'text.secondary', fontWeight: 400 }}
            >
              <Reference>{code.sku}</Reference>
            </Box>
          </Typography>
        )}

        {empty ? (
          <Empty code={code} handlers={handlers} />
        ) : (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ justifyContent: 'space-between' }}
            >
              <StatusLine code={code} />
              <Actions code={code} handlers={handlers} />
            </Stack>

            <Box component="dl" sx={{ m: 0 }}>
              <Figure
                label={intl.formatMessage(WORDS.onHand)}
                value={qty(code.onHand)}
                lines={<NotUsableLine code={code} />}
              />
              <Figure
                label={intl.formatMessage(WORDS.free)}
                value={qty(code.free)}
                lines={<FreeLine code={code} />}
              />
              <Figure
                label={intl.formatMessage(WORDS.held)}
                id={heldId}
                value={qty(code.held)}
                lines={<HeldLines code={code} />}
              />
              <Figure
                label={intl.formatMessage(WORDS.coming)}
                value={qty(code.coming)}
                lines={<ComingLines code={code} />}
              />
              <Figure
                label={intl.formatMessage(WORDS.left)}
                value={qty(code.position)}
                lines={
                  <Line>
                    {intl.formatMessage(
                      {
                        id: 'products.stock.leftSum',
                        defaultMessage:
                          '{usable} usable + {coming} coming − {needed} for orders',
                      },
                      {
                        usable: displayQuantity(code.usable),
                        coming: displayQuantity(code.coming),
                        needed: displayQuantity(code.stillNeeded),
                      },
                    )}
                  </Line>
                }
              />
            </Box>

            {code.places && <ByPlace code={code} onMove={handlers.onMove} />}
            {code.lots && <UsableLots code={code} />}
          </>
        )}
      </Stack>
    </Paper>
  );
}

/** A figure: its name, its value at the figure's size, and its lines. */
function Figure({
  label,
  id,
  value,
  lines,
}: {
  label: string;
  id?: string;
  value: string;
  lines: ReactNode;
}) {
  return (
    <Box
      id={id}
      tabIndex={id ? -1 : undefined}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: `${rem(120)} ${rem(200)} 1fr` },
        columnGap: 2,
        alignItems: 'baseline',
        py: 1,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Typography component="dt" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box
        component="dd"
        sx={{
          m: 0,
          fontSize: rem(TYPE.figure),
          lineHeight: 40 / TYPE.figure,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Box>
      <Box component="dd" sx={{ m: 0 }}>
        {lines}
      </Box>
    </Box>
  );
}

/** A line that explains a figure, at 14 px (Text and targets). */
function Line({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <Typography
      variant="body2"
      sx={{ color: tone === 'error' ? 'error.main' : 'text.secondary' }}
    >
      {children}
    </Typography>
  );
}

/** The status in Home's words, and "10 left · reorder at 36". */
function StatusLine({ code }: { code: CodeStanding }) {
  if (!code.status || code.reorderPoint === null) return <Box />;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <ReorderStatusChip status={code.status} />
      <LeftLine position={code.position} reorderPoint={code.reorderPoint} />
    </Stack>
  );
}

/**
 * Change reorder point by stock.reorder; Buy 30 or Make 1,000, as its
 * point says, by orders.create or production.create, the main action's
 * line naming whom to ask for a role without it; and what a draft covers.
 */
function Actions({
  code,
  handlers,
}: {
  code: CodeStanding;
  handlers: Handlers;
}) {
  const intl = useIntl();
  const can = useCan();
  const low = code.status === 'low' || code.status === 'out';
  const quantity = code.suggestion && displayQuantity(code.suggestion);

  let main: ReactNode = null;
  if (low && code.suggestion !== null && isZero(code.suggestion)) {
    main = (
      <Line>
        {intl.formatMessage(
          {
            id: 'inventory.reorder.chooseDrafted',
            defaultMessage:
              '{sku} is in a draft already, which covers what it needs.',
          },
          { sku: code.sku },
        )}
      </Line>
    );
  } else if (low && code.source === 'bought') {
    main = can('orders.create') ? (
      <Button onClick={() => handlers.onBuy(code)}>
        {intl.formatMessage(
          { id: 'products.stock.buy', defaultMessage: 'Buy {quantity}' },
          { quantity },
        )}
      </Button>
    ) : (
      <WhomToAskRead {...NO_BUY} />
    );
  } else if (low && code.source === 'made') {
    main = can('production.create') ? (
      <Button onClick={openDialog(() => handlers.onMake(code))}>
        {intl.formatMessage(
          { id: 'products.stock.make', defaultMessage: 'Make {quantity}' },
          { quantity },
        )}
      </Button>
    ) : (
      <WhomToAskRead {...NO_MAKE} />
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: 'wrap', alignItems: 'center', maxWidth: rem(480) }}
    >
      {can('stock.reorder') && (
        <Button
          variant="outlined"
          onClick={openDialog(() => handlers.onPoint(code))}
        >
          {code.reorderPoint === null
            ? intl.formatMessage({
                id: 'products.stock.setPoint',
                defaultMessage: 'Set a reorder point',
              })
            : intl.formatMessage({
                id: 'products.stock.changePoint',
                defaultMessage: 'Change reorder point',
              })}
        </Button>
      )}
      {main}
    </Stack>
  );
}

/** None on hand and no point: the next step by role (ADR-093's states). */
function Empty({ code, handlers }: { code: CodeStanding; handlers: Handlers }) {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();

  return (
    <Stack spacing={2}>
      <Typography>
        {intl.formatMessage({
          id: 'products.stock.empty',
          defaultMessage:
            'None on hand, nothing coming. Set a reorder point to be told when it runs low.',
        })}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' } }}
      >
        {can('stock.reorder') ? (
          <Button
            variant="outlined"
            onClick={openDialog(() => handlers.onPoint(code))}
          >
            {intl.formatMessage({
              id: 'products.stock.setPoint',
              defaultMessage: 'Set a reorder point',
            })}
          </Button>
        ) : (
          <WhomToAskRead {...NO_POINT} />
        )}
        {can('stock.move') ? (
          <Button
            onClick={() =>
              void navigate('/inventory?receive', { state: OFFER_BACK })
            }
          >
            {intl.formatMessage({
              id: 'inventory.receive',
              defaultMessage: 'Receive stock',
            })}
          </Button>
        ) : (
          <WhomToAskRead {...NO_RECEIVE} />
        )}
      </Stack>
    </Stack>
  );
}

/** "12 not usable: expired, at a place not available", or all usable. */
function NotUsableLine({ code }: { code: CodeStanding }) {
  const intl = useIntl();
  if (isZero(code.onHand)) return null;
  if (isZero(code.notUsable)) {
    return (
      <Line>
        {intl.formatMessage({
          id: 'products.stock.allUsable',
          defaultMessage: 'all usable',
        })}
      </Line>
    );
  }
  const reasons = [
    !isZero(code.expired) &&
      intl.formatMessage({
        id: 'products.stock.reason.expired',
        defaultMessage: 'expired',
      }),
    !isZero(code.issued) &&
      intl.formatMessage({
        id: 'products.stock.reason.issued',
        defaultMessage: 'issued to a run',
      }),
    !isZero(code.unavailable) &&
      intl.formatMessage({
        id: 'products.stock.reason.unavailable',
        defaultMessage: 'at a place not available',
      }),
  ].filter((reason): reason is string => !!reason);

  return (
    <Line tone="error">
      {intl.formatMessage(
        {
          id: 'products.stock.notUsableWhy',
          defaultMessage: '{quantity} not usable: {reasons}',
        },
        {
          quantity: displayQuantity(code.notUsable),
          reasons: intl.formatList(reasons, { type: 'conjunction' }),
        },
      )}
    </Line>
  );
}

/** What can still be promised, or what the orders want beyond it. */
function FreeLine({ code }: { code: CodeStanding }) {
  const intl = useIntl();
  if (!isZero(code.short)) {
    return (
      <Line tone="error">
        {intl.formatMessage(
          {
            id: 'products.stock.shortLine',
            defaultMessage: '{short} short: orders want {wanted}',
          },
          {
            short: displayQuantity(code.short),
            wanted: displayQuantity(code.stillNeeded),
          },
        )}
      </Line>
    );
  }
  return (
    <Line>
      {intl.formatMessage({
        id: 'products.stock.freeLine',
        defaultMessage: 'what you can still promise',
      })}
    </Line>
  );
}

/**
 * How many confirmed orders wait, and with orders.view each of them,
 * oldest confirmed first, the last the one short (ADR-045).
 */
function HeldLines({ code }: { code: CodeStanding }) {
  const intl = useIntl();

  return (
    <Stack spacing={0.5}>
      <Line>
        {intl.formatMessage(
          {
            id: 'products.stock.heldFor',
            defaultMessage:
              '{count, plural, =0 {no confirmed order waiting} one {for # confirmed order} other {for # confirmed orders}}',
          },
          { count: code.heldOrders },
        )}
      </Line>
      {code.holds?.map((hold) => (
        <Line
          key={hold.orderId}
          tone={!isZero(hold.short) ? 'error' : undefined}
        >
          <Link
            component={RouterLink}
            to={`/orders/${hold.orderId}`}
            state={OFFER_BACK}
          >
            <Reference>{hold.number}</Reference>
          </Link>
          {[
            '',
            hold.partnerName,
            !isZero(hold.short)
              ? intl.formatMessage(
                  {
                    id: 'products.stock.heldOf',
                    defaultMessage: '{held} of {wanted} held',
                  },
                  {
                    held: displayQuantity(hold.held),
                    wanted: displayQuantity(hold.wanted),
                  },
                )
              : intl.formatMessage(
                  {
                    id: 'products.stock.heldAll',
                    defaultMessage: '{held} held',
                  },
                  { held: displayQuantity(hold.held) },
                ),
            !isZero(hold.short) &&
              intl.formatMessage(
                {
                  id: 'inventory.stock.short',
                  defaultMessage: '{quantity} short',
                },
                { quantity: displayQuantity(hold.short) },
              ),
            hold.expectedAt &&
              intl.formatMessage(
                { id: 'products.stock.ships', defaultMessage: 'ships {day}' },
                { day: formatDay(hold.expectedAt) },
              ),
          ]
            .filter((part) => part !== false && part !== null)
            .join(SEPARATOR)}
        </Line>
      ))}
    </Stack>
  );
}

/** Its purchases with their days, and its runs, which have none. */
function ComingLines({ code }: { code: CodeStanding }) {
  const intl = useIntl();
  const qty = (value: string) =>
    displayWithUnit(value, code.unitOfMeasure, intl);

  if (isZero(code.coming)) {
    return (
      <Line>
        {intl.formatMessage({
          id: 'products.stock.nothingComing',
          defaultMessage: 'nothing on order or in a run',
        })}
      </Line>
    );
  }
  return (
    <Stack spacing={0.5}>
      {!code.purchases && !code.runs && code.comingOn && (
        <Line>{formatDay(code.comingOn)}</Line>
      )}
      {code.purchases?.map((line) => (
        <Line key={line.orderId} tone={line.late ? 'error' : undefined}>
          <Link
            component={RouterLink}
            to={`/orders/${line.orderId}`}
            state={OFFER_BACK}
          >
            <Reference>{line.number}</Reference>
          </Link>
          {[
            '',
            line.partnerName,
            qty(line.quantity),
            line.expectedAt && formatDay(line.expectedAt),
            line.late &&
              intl.formatMessage({
                id: 'products.stock.late',
                defaultMessage: 'late',
              }),
          ]
            .filter((part) => part !== false && part !== null)
            .join(SEPARATOR)}
        </Line>
      ))}
      {code.runs?.map((run) => (
        <Line key={run.runId}>
          <Link
            component={RouterLink}
            to={`/production/${run.runId}`}
            state={OFFER_BACK}
          >
            {run.reference ? (
              <Reference>{run.reference}</Reference>
            ) : (
              intl.formatMessage({
                id: 'products.stock.run',
                defaultMessage: 'A run',
              })
            )}
          </Link>
          {['', run.partnerName, qty(run.quantity)]
            .filter((part) => part !== null)
            .join(SEPARATOR)}
        </Line>
      ))}
    </Stack>
  );
}

/** By place and lot, for a reader with locations.view: Move by stock.move. */
function ByPlace({
  code,
  onMove,
}: {
  code: CodeStanding;
  onMove: (pile: StockPile) => void;
}) {
  const intl = useIntl();
  const can = useCan();
  const canMove = can('stock.move');
  const rows = code.places!.flatMap((place) =>
    place.lots.map((pile) => ({ place, pile })),
  );
  if (rows.length === 0) return null;
  // The place as Stock writes it, its warehouse path first (57a).
  const where = (place: (typeof rows)[number]['place']) => (
    <PlacePath place={place} />
  );
  const notAvailable = (
    <Line tone="error">
      {intl.formatMessage({
        id: 'inventory.stock.notAvailable',
        defaultMessage: 'Not usable: a place not available',
      })}
    </Line>
  );
  const move = (pile: StockPile) =>
    canMove && (
      <Button
        variant="text"
        size="small"
        aria-label={intl.formatMessage(
          {
            id: 'products.stock.moveLot',
            defaultMessage: 'Move {what}',
          },
          { what: pile.lotCode ?? pile.sku },
        )}
        onClick={openDialog(() => onMove(pile))}
      >
        {intl.formatMessage(WORDS.move)}
      </Button>
    );

  return (
    <Stack spacing={1}>
      <Typography component="h3" sx={{ fontWeight: 600 }}>
        {intl.formatMessage({
          id: 'products.stock.byPlace',
          defaultMessage: 'By place and lot',
        })}
      </Typography>
      <TableOrCards
        loading={false}
        table={
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{intl.formatMessage(WORDS.place)}</TableCell>
                  <TableCell>{intl.formatMessage(WORDS.lot)}</TableCell>
                  <TableCell>{intl.formatMessage(WORDS.expires)}</TableCell>
                  <TableCell align="right">
                    {intl.formatMessage(WORDS.onHand)}
                  </TableCell>
                  {canMove && (
                    <TableCell>{intl.formatMessage(WORDS.actions)}</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(({ place, pile }) => (
                  <TableRow key={pile.id}>
                    <TableCell>
                      {where(place)}
                      {!place.isAvailable && notAvailable}
                    </TableCell>
                    <TableCell>
                      {pile.lotId && pile.lotCode ? (
                        <LotLink id={pile.lotId} code={pile.lotCode} />
                      ) : (
                        NO_VALUE
                      )}
                    </TableCell>
                    <TableCell>
                      <ExpiryChip expiresAt={pile.lotExpiresAt} />
                    </TableCell>
                    <TableCell align="right">
                      {displayWithUnit(pile.quantity, code.unitOfMeasure, intl)}
                    </TableCell>
                    {canMove && <TableCell>{move(pile)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        }
        cards={
          <Stack component="ul" spacing={1} sx={{ m: 0, p: 0 }}>
            {rows.map(({ place, pile }) => (
              <Stack
                component="li"
                key={pile.id}
                direction="row"
                spacing={1}
                useFlexGap
                sx={{
                  listStyle: 'none',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {/* The lot keeps room to be read; its quantity and Move go
                    under it where all three do not fit (R14). */}
                <Stack sx={{ flex: '1 1 10rem', minWidth: 0 }}>
                  {where(place)}
                  {!place.isAvailable && notAvailable}
                  {pile.lotId && pile.lotCode && (
                    <LotLink id={pile.lotId} code={pile.lotCode} />
                  )}
                  <ExpiryChip expiresAt={pile.lotExpiresAt} />
                </Stack>
                <span>
                  {displayWithUnit(pile.quantity, code.unitOfMeasure, intl)}
                </span>
                {move(pile)}
              </Stack>
            ))}
          </Stack>
        }
      />
    </Stack>
  );
}

/**
 * Without locations.view: the usable lots, with how many places hold
 * each, and the not usable one line, so the figures still add up (A6).
 */
function UsableLots({ code }: { code: CodeStanding }) {
  const intl = useIntl();
  if (code.lots!.length === 0 && isZero(code.notUsable)) return null;

  return (
    <Stack spacing={1}>
      <Typography component="h3" sx={{ fontWeight: 600 }}>
        {intl.formatMessage({
          id: 'products.stock.usableLots',
          defaultMessage: 'Usable lots',
        })}
      </Typography>
      <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0 }}>
        {code.lots!.map((lot) => (
          <Stack
            component="li"
            key={lot.lotId ?? 'none'}
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ listStyle: 'none', alignItems: 'center', flexWrap: 'wrap' }}
          >
            {lot.lotId && lot.lotCode ? (
              <LotLink id={lot.lotId} code={lot.lotCode} />
            ) : (
              <span>{NO_VALUE}</span>
            )}
            <ExpiryChip expiresAt={lot.expiresAt} />
            <span>
              {displayWithUnit(lot.quantity, code.unitOfMeasure, intl)}
            </span>
            {lot.places > 1 && (
              <Line>
                {intl.formatMessage(
                  {
                    id: 'products.stock.inPlaces',
                    defaultMessage:
                      '{count, plural, one {in # place} other {in # places}}',
                  },
                  { count: lot.places },
                )}
              </Line>
            )}
          </Stack>
        ))}
      </Stack>
      {!isZero(code.notUsable) && (
        <Line tone="error">
          {intl.formatMessage(
            {
              id: 'inventory.stock.notUsable',
              defaultMessage: '{quantity} not usable',
            },
            { quantity: displayQuantity(code.notUsable) },
          )}
        </Line>
      )}
    </Stack>
  );
}
