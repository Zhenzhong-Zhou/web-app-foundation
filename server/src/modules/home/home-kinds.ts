import type { Permission } from '../../core/authorization/permissions';
import type { HomeLayout } from '../../database/schema';

export type HomeKind =
  | 'toShip'
  | 'toReceive'
  | 'drafts'
  | 'lowStock'
  | 'expiring'
  | 'costsWaiting'
  | 'invoicesToIssue'
  | 'returnsOpen'
  | 'production'
  | 'licences';

/**
 * The tiles in the order of a working day (ADR-091): who may see each, and
 * who does its work, so that it leads their Home by default (ADR-091,
 * amended November 2026). Drafts waits hidden until a person shows it.
 */
const TILES: {
  kind: HomeKind;
  permission: Permission;
  leads: readonly Permission[];
  hidden?: true;
}[] = [
  { kind: 'toShip', permission: 'orders.view', leads: ['orders.ship'] },
  { kind: 'toReceive', permission: 'orders.view', leads: ['orders.receive'] },
  {
    kind: 'drafts',
    permission: 'orders.view',
    leads: ['orders.create'],
    hidden: true,
  },
  {
    kind: 'lowStock',
    permission: 'stock.view',
    leads: ['orders.create', 'production.create'],
  },
  { kind: 'expiring', permission: 'stock.view', leads: ['stock.adjust'] },
  { kind: 'costsWaiting', permission: 'costs.view', leads: ['costs.update'] },
  {
    kind: 'invoicesToIssue',
    permission: 'invoices.view',
    leads: ['invoices.issue'],
  },
  {
    kind: 'returnsOpen',
    permission: 'return_authorizations.view',
    leads: ['return_authorizations.update'],
  },
  {
    kind: 'production',
    permission: 'production.view',
    leads: ['production.complete'],
  },
  {
    kind: 'licences',
    permission: 'product_licences.view',
    leads: ['product_licences.update'],
  },
];

/**
 * Every kind of tile this build knows, in the order of a working day: what
 * a layout saved may name (ADR-091, amended November 2026).
 */
export const HOME_KINDS: readonly HomeKind[] = TILES.map(({ kind }) => kind);

/** The kinds the member may see, the only ones Home counts. */
export function kindsSeenWith(held: ReadonlySet<Permission>): HomeKind[] {
  return TILES.flatMap(({ kind, permission }) =>
    held.has(permission) ? [kind] : [],
  );
}

/** A tile in its place on the reader's Home, and whether they hid it. */
export interface Placed {
  kind: HomeKind;
  hidden: boolean;
}

/**
 * The tiles the member may see, in the reader's order (ADR-091, amended
 * November 2026). By default, those whose work the member may do lead,
 * the rest follow, both in the working day's order, so an Owner's Home is
 * in that order; drafts hidden. A layout saved puts them in its order:
 * a kind the member may not see, or this build does not know, is skipped;
 * one it does not hold, a kind added since among them, takes its default
 * place, after the kind before it by default, hidden only if it is so by
 * default.
 */
export function arranged(
  held: ReadonlySet<Permission>,
  layout: HomeLayout | null,
): Placed[] {
  const seen = TILES.filter(({ permission }) => held.has(permission));
  const leads = ({ leads }: (typeof TILES)[number]) =>
    leads.some((permission) => held.has(permission));
  const byDefault = [
    ...seen.filter(leads),
    ...seen.filter((tile) => !leads(tile)),
  ];
  if (!layout) {
    return byDefault.map(({ kind, hidden }) => ({ kind, hidden: !!hidden }));
  }

  const kinds = byDefault.map(({ kind }) => kind);
  const order = layout.order.filter((kind): kind is HomeKind =>
    kinds.includes(kind as HomeKind),
  );
  const saved = new Set(order);
  kinds.forEach((kind, index) => {
    if (saved.has(kind)) return;
    const before = kinds
      .slice(0, index)
      .findLast((each) => order.includes(each));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, kind);
  });
  return order.map((kind) => ({
    kind,
    hidden: saved.has(kind)
      ? layout.hidden.includes(kind)
      : !!byDefault.find((tile) => tile.kind === kind)?.hidden,
  }));
}

/**
 * A layout to save, with what the stored one holds of kinds it does not
 * name (ADR-091, amended November 2026): a kind the member may not see
 * today, which their Home never sends, or one a tab from an older build
 * does not know. Those follow the rest, in their stored order, hidden as
 * they were, so they last past the next Done.
 */
export function keptWith(
  layout: HomeLayout,
  stored: HomeLayout | null,
): HomeLayout {
  const missing = (stored?.order ?? []).filter(
    (kind) => !layout.order.includes(kind),
  );
  return {
    order: [...layout.order, ...missing],
    hidden: [
      ...layout.hidden,
      ...(stored?.hidden ?? []).filter((kind) => missing.includes(kind)),
    ],
    recent: layout.recent,
  };
}
