import type { OrderDirection } from '../lib/types';

/**
 * The word for "done" depends on which way the goods went. The server stores
 * one status, `fulfilled`, so one rule governs both directions (ADR-041);
 * only what a person reads differs.
 */
export const DONE: Record<OrderDirection, string> = {
  purchase: 'Received',
  sale: 'Shipped',
};
