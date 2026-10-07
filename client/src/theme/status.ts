import type {
  BomStatus,
  InvoiceStatus,
  OrderStatus,
  ReturnAuthorizationStatus,
  RunStatus,
} from '../lib/types';
import type { ToneName } from './tokens';

/**
 * Every status the app shows, and its tone (ADR-055): one table, so a
 * status reads the same wherever it appears and two modules cannot give
 * one meaning two colours. A page asks this table and passes the tone to
 * StatusChip; it never picks a colour.
 *
 * Info is the normal state of something in progress, so it is the most
 * common tone and the quietest of the coloured ones. Warning and critical
 * are kept for what needs someone.
 */
export const STATUS_TONES: {
  order: Record<OrderStatus, ToneName>;
  invoice: Record<InvoiceStatus, ToneName>;
  returnAuthorization: Record<ReturnAuthorizationStatus, ToneName>;
  run: Record<RunStatus, ToneName>;
  recipe: Record<BomStatus, ToneName>;
} = {
  order: {
    draft: 'neutral',
    confirmed: 'info',
    fulfilled: 'positive',
    cancelled: 'neutral',
  },
  invoice: { draft: 'neutral', issued: 'info', voided: 'critical' },
  returnAuthorization: {
    open: 'info',
    closed: 'neutral',
    cancelled: 'neutral',
  },
  run: {
    draft: 'neutral',
    released: 'info',
    completed: 'positive',
    cancelled: 'neutral',
  },
  recipe: { draft: 'neutral', active: 'info', archived: 'neutral' },
};
