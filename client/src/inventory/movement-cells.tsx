import { Box, Link, Stack, TableCell, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { defineMessages, type IntlShape, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { Movement } from '../api/types.gen';
import { ExpiryChip } from '../components/expiry-chip';
import { LotLink } from '../components/lot-link';
import { NUMBER_COLUMN } from '../components/number-column';
import { Reference } from '../components/reference';
import { NameAndEmail } from '../components/who-and-when';
import { NO_VALUE } from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { displayWithUnit } from '../products/units';
import {
  describeMovement,
  movementActor,
  type MovementColumns,
} from './describe-movement';
import {
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
  countedIn: {
    id: 'inventory.movements.end.countedIn',
    defaultMessage: 'counted in',
  },
  countedOut: {
    id: 'inventory.movements.end.countedOut',
    defaultMessage: 'counted out',
  },
});

/**
 * Where a movement with no place at one end came from or went to, by its
 * reason (ADR-023): a receipt from a supplier, a return or a voided
 * shipment from a customer, a run's output from the run, a correction
 * counted in; a shipment to a customer, a run's use to the run, a
 * correction counted out. A sample names none.
 */
function outsideEnd(
  movement: Movement,
  side: 'from' | 'to',
): keyof typeof OUTSIDE | null {
  const coming = side === 'from';
  switch (movement.reason) {
    case 'receipt':
      return 'supplier';
    case 'shipment':
    case 'return':
      return 'customer';
    case 'production':
    case 'consumption':
      return 'run';
    case 'adjustment':
      return coming ? 'countedIn' : 'countedOut';
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
          <TableCell align="right">
            <Figure quantity={movement.quantityIn} movement={movement} />
          </TableCell>
          <TableCell align="right">
            <Figure quantity={movement.quantityOut} movement={movement} />
          </TableCell>
          {columns.figures === 'balance' && (
            <TableCell align="right">
              <Figure quantity={movement.balance} movement={movement} />
            </TableCell>
          )}
        </>
      )}
      <TableCell>
        <MovementReason movement={movement} />
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
export function MovementWhen({ movement }: { movement: Movement }) {
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
 * The change with its unit, "−4 each", "+24 each", a move between two
 * places unsigned: read without padding zeros, never parsed, since a
 * numeric through a JavaScript number is the loss ADR-025 exists to
 * avoid.
 */
export function MovementChange({ movement }: { movement: Movement }) {
  const intl = useIntl();
  const { sign } = describeMovement(movement);

  return (
    <>
      {sign}
      {displayWithUnit(movement.quantity, movement.unitOfMeasure, intl)}
    </>
  );
}

/** One of In, Out or the balance, with its unit, or a dash where none. */
export function Figure({
  quantity,
  movement,
}: {
  quantity: string | null;
  movement: Movement;
}) {
  const intl = useIntl();

  return quantity === null
    ? NO_VALUE
    : displayWithUnit(quantity, movement.unitOfMeasure, intl);
}

/** "Adjustment: miscount", the note a correction must carry under it. */
export function MovementReason({ movement }: { movement: Movement }) {
  const intl = useIntl();

  return (
    <>
      <Box sx={{ '&::first-letter': { textTransform: 'uppercase' } }}>
        {reasonWords(movement, intl)}
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
        { reason, detail: reasonDetailLabel(movement.reasonDetail, intl) },
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
      <End movement={movement} side="from" />
      <Stack direction="row" spacing={0.5} sx={{ minWidth: 0 }}>
        <span aria-hidden="true">{ARROW}</span>
        <End movement={movement} side="to" />
      </Stack>
    </Stack>
  );
}

function End({ movement, side }: { movement: Movement; side: 'from' | 'to' }) {
  const intl = useIntl();
  const id = side === 'from' ? movement.fromLocationId : movement.toLocationId;
  const name =
    side === 'from' ? movement.fromLocationName : movement.toLocationName;

  if (id && name) {
    return (
      <Box sx={{ minWidth: 0 }}>
        <PlacePath
          place={
            side === 'from'
              ? {
                  locationName: name,
                  locationCode: movement.fromLocationCode,
                  locationPath: movement.fromLocationPath,
                }
              : {
                  locationName: name,
                  locationCode: movement.toLocationCode,
                  locationPath: movement.toLocationPath,
                }
          }
        />
      </Box>
    );
  }

  const outside = id ? null : outsideEnd(movement, side);
  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {outside ? intl.formatMessage(OUTSIDE[outside]) : NO_VALUE}
    </Box>
  );
}

/** The lot's code, a link to its trace, its expiry under it. */
export function MovementLot({ movement }: { movement: Movement }) {
  if (!movement.lotId || !movement.lotCode) return NO_VALUE;

  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <LotLink id={movement.lotId} code={movement.lotCode} />
      {movement.lotExpiresAt && (
        <ExpiryChip expiresAt={movement.lotExpiresAt} />
      )}
    </Stack>
  );
}

/**
 * The document it was for (55a): the order received, shipped or returned
 * on, or the run, a link to its page; only what the reader may see comes.
 */
export function MovementFor({ movement }: { movement: Movement }) {
  const intl = useIntl();
  const document = movement.document;

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
export function MovementBy({ movement }: { movement: Movement }) {
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

/** A label and its value on a phone's card. */
export function CardLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right', minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}
