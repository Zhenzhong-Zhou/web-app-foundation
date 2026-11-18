import { defineMessages } from 'react-intl';

/**
 * The line where Receive stock would be, for a role that cannot, with whom
 * to ask (ADR-079): on Stock's first use and on Where it stands (ADR-093's
 * states).
 */
export const NO_RECEIVE = defineMessages({
  ask: {
    id: 'products.stock.receiveAsk',
    defaultMessage:
      'Your role does not include receiving stock. To do more, ask {names}.',
  },
  none: {
    id: 'products.stock.receiveNone',
    defaultMessage: 'Your role does not include receiving stock.',
  },
});
