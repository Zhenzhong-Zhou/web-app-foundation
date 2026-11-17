import type { Ref } from 'react';
import { type IntlShape, useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { StockPile } from '../api/types.gen';
import { type Action, ActionsMenu } from '../components/actions-menu';
import { itemName } from '../lib/format';
import { useMenuWords } from './menu-words';
import type { MoveMode } from './move-stock-dialog';
import type { HistoryOf } from './movement-history-dialog';

/**
 * One pile: a code at one place, in one lot when it tracks lots (ADR-093),
 * as a lot's row on Stock carries it, what this menu and the dialogs it
 * opens read. Its place's name is null for a reader without places.
 */
export type Pile = StockPile;

/**
 * A pile's Actions, a menu rather than a row of buttons. Shipping,
 * sampling, moving and correcting are all uncommon relative to reading the
 * table, and a control for each on every line makes the numbers, the thing
 * people actually came for, harder to scan.
 *
 * For everyone who may see stock: Movements and Trace lot only read, and a
 * Viewer's first week asks them to look a lot up (ADR-079). What changes
 * stock is offered only to those who may change it. The item's reorder
 * point is its code's row's, not a lot's (ADR-093).
 */
export function StockActions({
  row,
  canMove,
  canAdjust,
  onSelect,
  onHistory,
  onEditLot,
  buttonRef,
}: {
  row: Pile;
  /** stock.move: moving, shipping out, sampling and a lot's details. */
  canMove: boolean;
  canAdjust: boolean;
  onSelect: (mode: MoveMode, row: Pile) => void;
  onHistory: (of: HistoryOf) => void;
  onEditLot: (row: Pile) => void;
  /** For a row that moves focus to it: "Choose the lot". */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const words = useMenuWords();
  // An emptied lot, shown with Include empty or to correct it: nothing to
  // move, ship or send, only its count to correct (ADR-093 v3).
  const empty = row.quantity === NONE;
  const nothing = empty
    ? row.lotId
      ? intl.formatMessage({
          id: 'inventory.menu.nothingInLot',
          defaultMessage: 'Nothing in this lot',
        })
      : intl.formatMessage({
          id: 'inventory.menu.nothingHere',
          defaultMessage: 'Nothing at this place',
        })
    : undefined;

  // What changes stock: moving, shipping out and sampling, and, by
  // stock.adjust, correcting the count. Receiving, shipping and moving
  // record what happened in the world; a correction overrides the record
  // itself, and is held by fewer people. The guard refuses it server-side
  // either way: this is so the menu does not offer a control that always
  // fails. It is still a movement, so it needs stock.move as well.
  const changes: Action[] = canMove
    ? [
        {
          label: words.move,
          onSelect: () => onSelect('transfer', row),
          unavailable: nothing,
        },
        {
          label: words.ship,
          onSelect: () => onSelect('ship', row),
          unavailable: nothing,
        },
        // A hand-out: a trade show, a visitor, a bottle opened for a test.
        // A posted sample is a sale flagged as one, raised from Orders
        // (ADR-042).
        {
          label: words.sample,
          onSelect: () => onSelect('sample', row),
          unavailable: nothing,
        },
        ...(canAdjust
          ? [{ label: words.correct, onSelect: () => onSelect('adjust', row) }]
          : []),
      ]
    : [];

  // The lot itself: its details, for whoever may move stock, and where it
  // came from and everyone who has it (ADR-044). None for a code not
  // tracked by lot, where they would be a dead end.
  const lotId = row.lotId;
  const lot: Action[] = lotId
    ? [
        ...(canMove
          ? [{ label: words.editLot, onSelect: () => onEditLot(row) }]
          : []),
        {
          label: intl.formatMessage({
            id: 'inventory.actions.traceLot',
            defaultMessage: 'Trace lot',
          }),
          onSelect: () => void navigate(`/lots/${lotId}`),
        },
      ]
    : [];

  // Movements, as a code's row says it (ADR-093): the lot's, or, for a
  // code not tracked by lot, its place's; the history dialog until
  // Movements' branch.
  const reads: Action[] = [
    {
      label: words.movements,
      onSelect: () =>
        onHistory({
          ...row,
          at:
            !row.lotId && row.locationName !== null
              ? { locationId: row.locationId, locationName: row.locationName }
              : null,
        }),
    },
  ];

  return (
    <ActionsMenu
      name={pileActionsName(row, intl)}
      groups={[changes, lot, reads]}
      buttonRef={buttonRef}
    />
  );
}

/** A quantity of nothing, as the API writes it. */
const NONE = '0.0000';

/**
 * The pile's Actions named by what tells it from its neighbours, as v3
 * names them (ADR-093): "Actions for lot VC-0302 at Shelf A2"; a code not
 * tracked by lot, "Actions for Focus, 60 capsules at Shelf A2"; a reader
 * without places hears the lot or the item alone (A6).
 */
function pileActionsName(row: Pile, intl: IntlShape): string {
  const item = itemName(row.productName, row.variantName);
  if (row.lotCode) {
    return row.locationName === null
      ? intl.formatMessage(
          {
            id: 'inventory.actions.lot',
            defaultMessage: 'Actions for lot {lot}',
          },
          { lot: row.lotCode },
        )
      : intl.formatMessage(
          {
            id: 'inventory.actions.lotAt',
            defaultMessage: 'Actions for lot {lot} at {place}',
          },
          { lot: row.lotCode, place: row.locationName },
        );
  }
  return row.locationName === null
    ? intl.formatMessage(
        { id: 'inventory.actions.item', defaultMessage: 'Actions for {item}' },
        { item },
      )
    : intl.formatMessage(
        {
          id: 'inventory.actions.itemAt',
          defaultMessage: 'Actions for {item} at {place}',
        },
        { item, place: row.locationName },
      );
}
