import { Box, Link, Stack, TableCell, Typography } from '@mui/material';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { Movement } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { CardLine } from '../components/card-line';
import { ExpiryChip } from '../components/expiry-chip';
import { LotLink } from '../components/lot-link';
import { NUMBER_COLUMN } from '../components/number-column';
import { Reference } from '../components/reference';
import { NameAndEmail } from '../components/who-and-when';
import { itemName, NO_VALUE } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { OFFER_BACK } from '../lib/offer-back';
import type { RowReturn } from '../lib/use-row-return';
import { NameAndCode } from '../products/name-and-code';
import { displayWithUnit } from '../products/units';
import {
  movedInNeither,
  movementActor,
  type MovementColumns,
} from './describe-movement';
import {
  inSentence,
  MOVEMENT_HEADINGS,
  reasonDetailLabel,
  reasonLabel,
} from './movement-reasons';
import { PlacePath } from './place-path';

/** The arrow between a movement's ends: data, the same in every language. */
const ARROW = '→';

/** An end outside the warehouse, in grey words (ADR-093, 82a). */
const OUTSIDE = defineMessages({
  supplier: {
    id: 'inventory.movements.end.supplier',
    defaultMessage: 'supplier',
  },
  customer: {
    id: 'inventory.movements.end.customer',
    defaultMessage: 'customer',
  },
  run: { id: 'inventory.movements.end.run', defaultMessage: 'run' },
  sample: { id: 'inventory.movements.end.sample', defaultMessage: 'sample' },
  countedIn: {
    id: 'inventory.movements.end.countedIn',
    defaultMessage: 'counted in',
  },
  countedOut: {
    id: 'inventory.movements.end.countedOut',
    defaultMessage: 'counted out',
  },
  opening: {
    id: 'inventory.movements.end.opening',
    defaultMessage: 'opening stock',
  },
  other: { id: 'inventory.movements.end.other', defaultMessage: 'other' },
});

/**
 * Where a movement with no place at one end came from or went to, by its
 * reason (ADR-023): a receipt from a supplier, or by why it came with no
 * order, opening stock, a customer for stock brought back, or other
 * (ADR-094, D3); a return or a voided shipment from a customer, a run's
 * output from the run, a correction counted in; a shipment to a
 * customer, a run's use to the run, a sample to "sample", read as a
 * shipment is (125), a correction counted out.
 */
function outsideEnd(
  movement: Movement,
  side: 'from' | 'to',
): keyof typeof OUTSIDE | null {
  const coming = side === 'from';
  switch (movement.reason) {
    case 'receipt':
      return receiptEnd(movement.reasonDetail);
    case 'shipment':
    case 'return':
      return 'customer';
    case 'production':
    case 'consumption':
      return 'run';
    case 'sample':
      return 'sample';
    case 'adjustment':
      return coming ? 'countedIn' : 'countedOut';
    default:
      return null;
  }
}

/**
 * A receipt's outside end by why it was received (ADR-094, D3): none, on
 * an order, or a sample, from a supplier; opening stock; stock a customer
 * brought back; or other. A detail this tab does not know says nothing,
 * since it cannot know where that stock came from (D4).
 */
function receiptEnd(detail: string | null): keyof typeof OUTSIDE | null {
  switch (detail) {
    case null:
    case 'sample':
      return 'supplier';
    case 'opening':
      return 'opening';
    case 'returned':
      return 'customer';
    case 'other':
      return 'other';
    default:
      return null;
  }
}

/** The columns' heads, after a list's own When and Item. */
export function MovementHeads({ columns }: { columns: MovementColumns }) {
  const intl = useIntl();

  return (
    <>
      {columns.figures === 'change' ? (
        <TableCell {...NUMBER_COLUMN}>
          {intl.formatMessage(MOVEMENT_HEADINGS.change)}
        </TableCell>
      ) : (
        <>
          <TableCell {...NUMBER_COLUMN}>
            {intl.formatMessage(MOVEMENT_HEADINGS.in)}
          </TableCell>
          <TableCell {...NUMBER_COLUMN}>
            {intl.formatMessage(MOVEMENT_HEADINGS.out)}
          </TableCell>
          {columns.figures === 'balance' && (
            <TableCell {...NUMBER_COLUMN}>
              {intl.formatMessage(MOVEMENT_HEADINGS.balance)}
            </TableCell>
          )}
        </>
      )}
      <TableCell>{intl.formatMessage(MOVEMENT_HEADINGS.reason)}</TableCell>
      {columns.places && (
        <TableCell>{intl.formatMessage(MOVEMENT_HEADINGS.fromTo)}</TableCell>
      )}
      <TableCell>{intl.formatMessage(MOVEMENT_HEADINGS.lot)}</TableCell>
      <TableCell>{intl.formatMessage(MOVEMENT_HEADINGS.for)}</TableCell>
      <TableCell>{intl.formatMessage(MOVEMENT_HEADINGS.by)}</TableCell>
    </>
  );
}

/**
 * A movement's cells under `MovementHeads` (#282): one piece for
 * Movements, the item's latest movements and any list that shows them,
 * so a movement reads the same wherever it is listed (ADR-093, R9, R20).
 */
export function MovementCells({
  movement,
  columns,
}: {
  movement: Movement;
  columns: MovementColumns;
}) {
  return (
    <>
      {columns.figures === 'change' ? (
        <TableCell align="right">
          <MovementChange movement={movement} />
        </TableCell>
      ) : (
        <>
          {movedInNeither(movement) ? (
            <TableCell colSpan={2} align="center">
              <MovedInNeither movement={movement} />
            </TableCell>
          ) : (
            <>
              <TableCell align="right">
                <Figure quantity={movement.quantityIn} movement={movement} />
              </TableCell>
              <TableCell align="right">
                <Figure quantity={movement.quantityOut} movement={movement} />
              </TableCell>
            </>
          )}
          {columns.figures === 'balance' && (
            <TableCell align="right">
              <Figure quantity={movement.balance} movement={movement} />
            </TableCell>
          )}
        </>
      )}
      <TableCell>
        <MovementReason movement={movement} places={columns.places} />
      </TableCell>
      {columns.places && (
        <TableCell>
          <MovementEnds movement={movement} />
        </TableCell>
      )}
      <TableCell>
        <MovementLot movement={movement} />
      </TableCell>
      <TableCell>
        <MovementFor movement={movement} />
      </TableCell>
      <TableCell>
        <MovementBy movement={movement} />
      </TableCell>
    </>
  );
}

/**
 * When it was recorded, to the minute, in the reader's language and
 * time: "16 Nov, 14:10", the year too when it is not this one. A log is
 * read by its moments, which "15 days ago" blurs (ADR-093, 18a).
 */
export function MovementWhen({
  movement,
}: {
  movement: Pick<Movement, 'createdAt'>;
}) {
  const intl = useIntl();
  const at = new Date(movement.createdAt);

  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {intl.formatDate(at, {
        day: 'numeric',
        month: 'short',
        year:
          at.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}
    </Box>
  );
}

/**
 * The change with its unit, "−4 each", "+24 each": the server's signed
 * change, which the export writes too, so the two never differ (review
 * 24); a move counted as neither, between two places across every place,
 * in grey words, "moved 20 each", never a bare number, which reads as
 * stock added (118a). Read without padding zeros, never parsed, since a
 * numeric through a JavaScript number is the loss ADR-025 exists to
 * avoid.
 */
export function MovementChange({ movement }: { movement: Movement }) {
  const intl = useIntl();
  const { change, quantity, unitOfMeasure } = movement;

  if (change === null) {
    const moved = displayWithUnit(quantity, unitOfMeasure, intl);
    return (
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {movement.reason === 'lot_change'
          ? intl.formatMessage(
              {
                id: 'inventory.movements.movedIntoLot',
                defaultMessage: 'moved {quantity} into a lot',
              },
              { quantity: moved },
            )
          : intl.formatMessage(
              {
                id: 'inventory.movements.moved',
                defaultMessage: 'moved {quantity}',
              },
              { quantity: moved },
            )}
      </Box>
    );
  }
  const out = change.startsWith('-');
  return (
    <>
      {out ? '−' : '+'}
      {displayWithUnit(out ? change.slice(1) : change, unitOfMeasure, intl)}
    </>
  );
}

/**
 * How many a move counted in neither In nor Out moved, once, in grey
 * across both columns: "moved 20 each, counted in neither" (118a).
 */
export function MovedInNeither({ movement }: { movement: Movement }) {
  const intl = useIntl();
  const quantity = displayWithUnit(
    movement.quantity,
    movement.unitOfMeasure,
    intl,
  );

  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {/* A lot change, "moved 3,000 each into a lot, counted in neither"
          (ADR-094, R16). */}
      {movement.reason === 'lot_change'
        ? intl.formatMessage(
            {
              id: 'inventory.movements.movedIntoLotNeither',
              defaultMessage: 'moved {quantity} into a lot, counted in neither',
            },
            { quantity },
          )
        : intl.formatMessage(
            {
              id: 'inventory.movements.movedNeither',
              defaultMessage: 'moved {quantity}, counted in neither',
            },
            { quantity },
          )}
    </Box>
  );
}

/** One of In, Out or the balance, with its unit, or a dash where none. */
export function Figure({
  quantity,
  movement,
}: {
  quantity: string | null;
  movement: Pick<Movement, 'unitOfMeasure'>;
}) {
  const intl = useIntl();

  return quantity === null
    ? NO_VALUE
    : displayWithUnit(quantity, movement.unitOfMeasure, intl);
}

/**
 * "Corrected: miscount", the note a correction must carry under it. A
 * receipt's partner is its From end; with no From → to column, for a
 * reader without `locations.view`, it follows the reason, "Received:
 * returned · from Harbour Foods": a partner is not a place, so places'
 * permission does not hide it (ADR-094, S7).
 */
export function MovementReason({
  movement,
  places,
}: {
  movement: Movement;
  /** Whether the From → to column is shown beside it. */
  places: boolean;
}) {
  const intl = useIntl();
  const sender =
    !places && movement.reason === 'receipt' ? movement.recipient : null;

  return (
    <>
      <Box>
        {sender ? (
          <FormattedMessage
            id="inventory.movements.reasonFrom"
            defaultMessage="{reason} · from {partner}"
            values={{
              reason: reasonWords(movement, intl),
              partner: <Sender sender={sender} underline="always" />,
            }}
          />
        ) : (
          reasonWords(movement, intl)
        )}
      </Box>
      {/* Required on an adjustment, because a person asserting the
          system is wrong has to say what they found (ADR-023). This is
          where it gets read. */}
      {movement.note && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {movement.note}
        </Typography>
      )}
    </>
  );
}

/** A movement's reason in words, with its detail where it has one. */
function reasonWords(movement: Movement, intl: IntlShape): string {
  const reason = reasonLabel(movement.reason, intl);
  return movement.reasonDetail
    ? intl.formatMessage(
        {
          id: 'inventory.movements.reasonDetail',
          defaultMessage: '{reason}: {detail}',
        },
        {
          reason,
          detail: inSentence(
            reasonDetailLabel(movement.reasonDetail, intl),
            intl,
          ),
        },
      )
    : reason;
}

/**
 * From → to on two lines (82a): where it came from, then "→" and where
 * it went, each place by its path cut in its middle (`PlacePath`, 93a),
 * an end outside the warehouse in grey words. Only for a reader who may
 * see places; the server sends the rest none (96a).
 */
export function MovementEnds({ movement }: { movement: Movement }) {
  return (
    <Stack sx={{ minWidth: 0 }}>
      <MovementEnd movement={movement} side="from" />
      <Stack direction="row" spacing={0.5} sx={{ minWidth: 0 }}>
        <span aria-hidden="true">{ARROW}</span>
        <MovementEnd movement={movement} side="to" />
      </Stack>
    </Stack>
  );
}

/** One end of a movement: a place by its path, or outside in grey words. */
export function MovementEnd({
  movement,
  side,
}: {
  movement: Movement;
  side: 'from' | 'to';
}) {
  const intl = useIntl();
  const [id, place] =
    side === 'from'
      ? [
          movement.fromLocationId,
          {
            locationName: movement.fromLocationName,
            locationCode: movement.fromLocationCode,
            locationPath: movement.fromLocationPath,
          },
        ]
      : [
          movement.toLocationId,
          {
            locationName: movement.toLocationName,
            locationCode: movement.toLocationCode,
            locationPath: movement.toLocationPath,
          },
        ];

  if (id && place.locationName) {
    return (
      <Box sx={{ minWidth: 0 }}>
        <PlacePath place={place} />
      </Box>
    );
  }

  // A receipt's partner is where it came from (ADR-094, D3, amending
  // ADR-093's 82a).
  const sender =
    side === 'from' && movement.reason === 'receipt'
      ? movement.recipient
      : null;
  if (sender) return <Sender sender={sender} />;

  const outside = id ? null : outsideEnd(movement, side);
  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {outside ? intl.formatMessage(OUTSIDE[outside]) : NO_VALUE}
    </Box>
  );
}

/**
 * Whom a receipt came from (ADR-094, D3): a link for whoever may open
 * partners, grey words for the rest.
 */
function Sender({
  sender,
  underline,
}: {
  sender: NonNullable<Movement['recipient']>;
  /** Inside a sentence, as after the reason. */
  underline?: 'always';
}) {
  const can = useCan();

  return can('partners.view') ? (
    <Link
      component={RouterLink}
      to={`/partners/${sender.id}`}
      state={OFFER_BACK}
      underline={underline}
    >
      {sender.name}
    </Link>
  ) : (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {sender.name}
    </Box>
  );
}

/**
 * The lot's code, a link to its trace, its expiry under it; a lot change
 * both its lots, "LOT-A → LOT-B", the one it left first, each a link; and
 * as lot tracking starts, or for stock back from before, the lot it
 * entered alone, there being no first (ADR-094; review 30).
 */
export function MovementLot({
  movement,
}: {
  movement: Pick<Movement, 'lotId' | 'lotCode' | 'lotExpiresAt' | 'lotExpiry'> &
    Partial<Pick<Movement, 'toLotId' | 'toLotCode'>>;
}) {
  const intl = useIntl();
  if (movement.toLotId && movement.toLotCode && !movement.lotId) {
    return <LotLink id={movement.toLotId} code={movement.toLotCode} />;
  }
  if (movement.toLotId && movement.toLotCode) {
    return (
      <Stack
        direction="row"
        spacing={0.5}
        useFlexGap
        sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        {movement.lotId && movement.lotCode ? (
          <LotLink id={movement.lotId} code={movement.lotCode} />
        ) : (
          NO_VALUE
        )}
        {/* Heard as a word, the arrow being only seen. */}
        <span aria-hidden="true">{ARROW}</span>
        <Box component="span" sx={HIDDEN}>
          {intl.formatMessage({
            id: 'inventory.movements.intoLot',
            defaultMessage: 'into',
          })}
        </Box>
        <LotLink id={movement.toLotId} code={movement.toLotCode} />
      </Stack>
    );
  }
  if (!movement.lotId || !movement.lotCode) return NO_VALUE;

  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <LotLink id={movement.lotId} code={movement.lotCode} />
      {/* Its expiry, or "Expiry to add" while it is not known (ADR-094,
          D2); nothing for a lot that does not expire. */}
      {(movement.lotExpiresAt || movement.lotExpiry === 'unknown') && (
        <ExpiryChip
          expiresAt={movement.lotExpiresAt}
          expiry={movement.lotExpiry}
        />
      )}
    </Stack>
  );
}

/**
 * The document it was for (55a): the order received, shipped or returned
 * on, or the run, a link to its page; a sample's recipient, a link to the
 * partner (125); only what the reader may see comes. A receipt's partner
 * is its From end, never here (ADR-094, D3).
 */
export function MovementFor({ movement }: { movement: Movement }) {
  const intl = useIntl();
  const { document } = movement;
  const recipient = movement.reason === 'receipt' ? null : movement.recipient;

  if (recipient) {
    return (
      <Link
        component={RouterLink}
        to={`/partners/${recipient.id}`}
        state={OFFER_BACK}
      >
        {recipient.name}
      </Link>
    );
  }
  if (!document) return NO_VALUE;

  return (
    <Link
      component={RouterLink}
      to={
        document.kind === 'order'
          ? `/orders/${document.id}`
          : `/production/${document.id}`
      }
      state={OFFER_BACK}
    >
      {document.number ? (
        <Reference>{document.number}</Reference>
      ) : (
        intl.formatMessage({
          id: 'products.stock.run',
          defaultMessage: 'A run',
        })
      )}
    </Link>
  );
}

/**
 * Who, by name, their email beneath (#256); Deleted user once anonymised
 * (ADR-012). The row survives its author, which is what RESTRICT on
 * actor_id is for.
 */
export function MovementBy({
  movement,
}: {
  movement: Pick<Movement, 'actorName' | 'actorEmail'>;
}) {
  const intl = useIntl();

  return (
    <NameAndEmail
      {...movementActor(
        movement,
        intl.formatMessage(MOVEMENT_HEADINGS.deletedUser),
      )}
    />
  );
}

/**
 * The item: its name, today's code and its type's word grey under it,
 * the code it was recorded under when that has changed (ADR-023; 7a),
 * the name its one link (the design language's Rows).
 */
export function MovementItem({
  movement,
}: {
  movement: Pick<
    Movement,
    'productId' | 'productName' | 'variantName' | 'type' | 'sku' | 'currentSku'
  >;
}) {
  const intl = useIntl();

  return (
    <NameAndCode
      name={itemName(movement.productName, movement.variantName)}
      code={movement.currentSku}
      withType
      type={movement.type}
      coverFileId={null}
      to={`/items/${movement.productId}`}
      under={
        movement.sku !== movement.currentSku &&
        intl.formatMessage(
          { id: 'inventory.movements.was', defaultMessage: 'was {code}' },
          { code: movement.sku },
        )
      }
    />
  );
}

/**
 * A movement as a card below 600 px (R14; v2's phone board): the item,
 * unless one code is chosen, then each column's value by its head, In
 * or Out alone where the other is empty.
 */
export function MovementCard({
  movement,
  columns,
  oneCode,
  back,
}: {
  movement: Movement;
  columns: MovementColumns;
  oneCode: boolean;
  /** Its way back from a link followed in it (useRowReturn). */
  back?: RowReturn;
}) {
  const intl = useIntl();
  const head = (key: keyof typeof MOVEMENT_HEADINGS) =>
    intl.formatMessage(MOVEMENT_HEADINGS[key]);

  return (
    <Box
      component="li"
      {...back}
      sx={{
        listStyle: 'none',
        p: 2,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Stack spacing={1}>
        {!oneCode && <MovementItem movement={movement} />}
        <CardLine label={head('when')}>
          <MovementWhen movement={movement} />
        </CardLine>
        {columns.figures === 'change' ? (
          <CardLine label={head('change')}>
            <MovementChange movement={movement} />
          </CardLine>
        ) : (
          <>
            {/* The same words as its row, on a line of their own. */}
            {movedInNeither(movement) && (
              <Typography variant="body2">
                <MovedInNeither movement={movement} />
              </Typography>
            )}
            {movement.quantityIn !== null && (
              <CardLine label={head('in')}>
                <Figure quantity={movement.quantityIn} movement={movement} />
              </CardLine>
            )}
            {movement.quantityOut !== null && (
              <CardLine label={head('out')}>
                <Figure quantity={movement.quantityOut} movement={movement} />
              </CardLine>
            )}
            {columns.figures === 'balance' && (
              <CardLine label={head('balance')}>
                <Figure quantity={movement.balance} movement={movement} />
              </CardLine>
            )}
          </>
        )}
        <CardLine label={head('reason')}>
          <MovementReason movement={movement} places={columns.places} />
        </CardLine>
        {columns.places && (
          <CardLine label={head('fromTo')}>
            <MovementEnds movement={movement} />
          </CardLine>
        )}
        <CardLine label={head('lot')}>
          <MovementLot movement={movement} />
        </CardLine>
        <CardLine label={head('for')}>
          <MovementFor movement={movement} />
        </CardLine>
        <CardLine label={head('by')}>
          <MovementBy movement={movement} />
        </CardLine>
      </Stack>
    </Box>
  );
}
