import { useIntl } from 'react-intl';

/**
 * The words of Stock's menus, a dialog's ellipsis after each that opens
 * one (ADR-093 v3): an item's and a lot's alike.
 */
export function useMenuWords() {
  const intl = useIntl();
  return {
    move: intl.formatMessage({
      id: 'inventory.menu.move',
      defaultMessage: 'Move…',
    }),
    ship: intl.formatMessage({
      id: 'inventory.menu.ship',
      defaultMessage: 'Ship out…',
    }),
    sample: intl.formatMessage({
      id: 'inventory.menu.sample',
      defaultMessage: 'Send sample…',
    }),
    correct: intl.formatMessage({
      id: 'inventory.menu.correct',
      defaultMessage: 'Correct the count…',
    }),
    receive: intl.formatMessage({
      id: 'inventory.menu.receive',
      defaultMessage: 'Receive stock…',
    }),
    editLot: intl.formatMessage({
      id: 'inventory.menu.editLot',
      defaultMessage: 'Edit lot details…',
    }),
    moveToLot: intl.formatMessage({
      id: 'inventory.menu.moveToLot',
      defaultMessage: 'Move to another lot…',
    }),
    movements: intl.formatMessage({
      id: 'layout.nav.movements',
      defaultMessage: 'Movements',
    }),
    changePoint: intl.formatMessage({
      id: 'inventory.menu.changePoint',
      defaultMessage: 'Change reorder point…',
    }),
    setPoint: intl.formatMessage({
      id: 'inventory.menu.setPoint',
      defaultMessage: 'Set a reorder point…',
    }),
  };
}
