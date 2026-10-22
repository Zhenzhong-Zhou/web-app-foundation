import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from 'react-intl';

import type { Permission } from '../api/types.gen';

/**
 * What you can do here (ADR-079), from the permissions the session holds,
 * never from the role's name: so it grows finer with job roles, and holds
 * for a role an organization makes.
 *
 * Every permission has its area and its words, keyed by the generated
 * Permission type, so a permission added on the server without words here
 * does not compile. Most say what they let the reader see, add or change,
 * one thing each, and an area says its things together: "add and change
 * products, recipes and product licences". A thing the reader may add or
 * change is not also said as seen. The rest are acts of their own,
 * "correct a count", and acts done to the same thing are said once with
 * their verbs together, "raise, change, confirm and cancel orders", never
 * a verb the reader does not hold. An area's phrases are joined as the reader's language
 * joins a list (Intl.ListFormat), and an area they cannot touch is left out.
 */

/** The areas, in the ADR's order. */
export const AREAS = [
  'stock',
  'products',
  'orders',
  'production',
  'invoices',
  'costs',
  'partners',
  'people',
] as const;

export type Area = (typeof AREAS)[number];

export const AREA_LABELS = defineMessages<Area>({
  stock: {
    id: 'account.access.area.stock',
    defaultMessage: 'Stock and locations',
  },
  products: {
    id: 'account.access.area.products',
    defaultMessage: 'Products and licences',
  },
  orders: { id: 'account.access.area.orders', defaultMessage: 'Orders' },
  production: {
    id: 'account.access.area.production',
    defaultMessage: 'Production',
  },
  invoices: {
    id: 'account.access.area.invoices',
    defaultMessage: 'Invoices and returns',
  },
  costs: {
    id: 'account.access.area.costs',
    defaultMessage: 'Costs, prices and tax',
  },
  partners: { id: 'account.access.area.partners', defaultMessage: 'Partners' },
  people: {
    id: 'account.access.area.people',
    defaultMessage: 'People and the organization',
  },
});

/** The things seen, added or changed, in the order an area names them. */
const THINGS = defineMessages({
  onHand: {
    id: 'account.access.thing.onHand',
    defaultMessage: 'what is on hand',
  },
  locations: {
    id: 'account.access.thing.locations',
    defaultMessage: 'locations',
  },
  lotHistory: {
    id: 'account.access.thing.lotHistory',
    defaultMessage: 'each lot’s history',
  },
  products: { id: 'account.access.thing.products', defaultMessage: 'products' },
  recipes: { id: 'account.access.thing.recipes', defaultMessage: 'recipes' },
  licences: {
    id: 'account.access.thing.licences',
    defaultMessage: 'product licences',
  },
  orders: {
    id: 'account.access.thing.orders',
    defaultMessage: 'purchase and sales orders',
  },
  orderPrices: {
    id: 'account.access.thing.orderPrices',
    defaultMessage: 'their prices',
  },
  runs: {
    id: 'account.access.thing.runs',
    defaultMessage: 'production runs and what they used',
  },
  invoices: { id: 'account.access.thing.invoices', defaultMessage: 'invoices' },
  creditNotes: {
    id: 'account.access.thing.creditNotes',
    defaultMessage: 'credit notes',
  },
  returns: {
    id: 'account.access.thing.returns',
    defaultMessage: 'return authorizations',
  },
  costs: { id: 'account.access.thing.costs', defaultMessage: 'costs' },
  exchangeRates: {
    id: 'account.access.thing.exchangeRates',
    defaultMessage: 'exchange rates',
  },
  priceLists: {
    id: 'account.access.thing.priceLists',
    defaultMessage: 'price lists',
  },
  taxCodes: {
    id: 'account.access.thing.taxCodes',
    defaultMessage: 'tax codes',
  },
  partners: {
    id: 'account.access.thing.partners',
    defaultMessage: 'customers and suppliers',
  },
  people: {
    id: 'account.access.thing.people',
    defaultMessage: 'who works here',
  },
  settings: {
    id: 'account.access.thing.settings',
    defaultMessage: 'the organization’s settings',
  },
  auditLog: {
    id: 'account.access.thing.auditLog',
    defaultMessage: 'the audit log',
  },
});

type Thing = keyof typeof THINGS;

/**
 * A thing seen that reads differently from the same thing added or
 * changed: "see where stock is kept", "add and change locations".
 */
const SEEN_AS: Partial<Record<Thing, MessageDescriptor>> = defineMessages({
  locations: {
    id: 'account.access.thing.locations.seen',
    defaultMessage: 'where stock is kept',
  },
  products: {
    id: 'account.access.thing.products.seen',
    defaultMessage: 'the catalogue',
  },
  taxCodes: {
    id: 'account.access.thing.taxCodes.seen',
    defaultMessage: 'tax codes and their rates',
  },
});

const VERBS = defineMessages({
  see: { id: 'account.access.see', defaultMessage: 'see {things}' },
  add: { id: 'account.access.add', defaultMessage: 'add {things}' },
  change: { id: 'account.access.change', defaultMessage: 'change {things}' },
  addAndChange: {
    id: 'account.access.addAndChange',
    defaultMessage: 'add and change {things}',
  },
});

const ACTS = defineMessages({
  stockMove: {
    id: 'account.access.act.stockMove',
    defaultMessage: 'receive, ship and move stock',
  },
  stockAdjust: {
    id: 'account.access.act.stockAdjust',
    defaultMessage: 'correct a count',
  },
  ordersReceive: {
    id: 'account.access.act.ordersReceive',
    defaultMessage: 'receive what was ordered',
  },
  ordersShip: {
    id: 'account.access.act.ordersShip',
    defaultMessage: 'ship what was sold',
  },
  productionComplete: {
    id: 'account.access.act.productionComplete',
    defaultMessage: 'record what runs make',
  },
  productionOverride: {
    id: 'account.access.act.productionOverride',
    defaultMessage:
      'release a run whose licence is not in force, with a reason',
  },
  rolesAssign: {
    id: 'account.access.act.rolesAssign',
    defaultMessage: 'change members’ roles',
  },
  organizationsExport: {
    id: 'account.access.act.organizationsExport',
    defaultMessage: 'download everything the organization holds',
  },
  organizationsDelete: {
    id: 'account.access.act.organizationsDelete',
    defaultMessage: 'close the organization',
  },
});

/**
 * What a few permissions each do to the same thing, said once with their
 * verbs together: "raise, change, confirm and cancel orders", each verb only
 * for a permission the reader holds.
 */
const ACTED_ON = defineMessages({
  orders: {
    id: 'account.access.actedOn.orders',
    defaultMessage: '{verbs} orders',
  },
  runs: { id: 'account.access.actedOn.runs', defaultMessage: '{verbs} runs' },
  invoices: {
    id: 'account.access.actedOn.invoices',
    defaultMessage: '{verbs} invoices',
  },
  drafts: {
    id: 'account.access.actedOn.drafts',
    defaultMessage: '{verbs} drafts',
  },
  returns: {
    id: 'account.access.actedOn.returns',
    defaultMessage: '{verbs} returns',
  },
  members: {
    id: 'account.access.actedOn.members',
    defaultMessage: '{verbs} members',
  },
  roles: {
    id: 'account.access.actedOn.roles',
    defaultMessage: '{verbs} roles',
  },
});

type ActedOn = keyof typeof ACTED_ON;

/** The verbs, each joined with the others done to the same thing. */
const DOING = defineMessages({
  raise: { id: 'account.access.doing.raise', defaultMessage: 'raise' },
  change: { id: 'account.access.doing.change', defaultMessage: 'change' },
  confirm: { id: 'account.access.doing.confirm', defaultMessage: 'confirm' },
  cancel: { id: 'account.access.doing.cancel', defaultMessage: 'cancel' },
  plan: { id: 'account.access.doing.plan', defaultMessage: 'plan' },
  release: { id: 'account.access.doing.release', defaultMessage: 'release' },
  draft: { id: 'account.access.doing.draft', defaultMessage: 'draft' },
  issue: { id: 'account.access.doing.issue', defaultMessage: 'issue' },
  void: { id: 'account.access.doing.void', defaultMessage: 'void' },
  delete: { id: 'account.access.doing.delete', defaultMessage: 'delete' },
  authorize: {
    id: 'account.access.doing.authorize',
    defaultMessage: 'authorize',
  },
  close: { id: 'account.access.doing.close', defaultMessage: 'close' },
  invite: { id: 'account.access.doing.invite', defaultMessage: 'invite' },
  remove: { id: 'account.access.doing.remove', defaultMessage: 'remove' },
  make: { id: 'account.access.doing.make', defaultMessage: 'make' },
});

type Grant =
  | { area: Area; verb: 'see' | 'add' | 'change'; things: readonly Thing[] }
  | { area: Area; act: MessageDescriptor }
  | { area: Area; actsOn: ActedOn; verbs: readonly MessageDescriptor[] };

const see = (area: Area, ...things: Thing[]): Grant => ({
  area,
  verb: 'see',
  things,
});
const add = (area: Area, ...things: Thing[]): Grant => ({
  area,
  verb: 'add',
  things,
});
const change = (area: Area, ...things: Thing[]): Grant => ({
  area,
  verb: 'change',
  things,
});
const act = (area: Area, words: MessageDescriptor): Grant => ({
  area,
  act: words,
});
const doing = (
  area: Area,
  actsOn: ActedOn,
  ...verbs: MessageDescriptor[]
): Grant => ({ area, actsOn, verbs });

/** Every permission's area and words. Acts are said in this order. */
const GRANTS: Record<Permission, Grant> = {
  'stock.view': see('stock', 'onHand', 'lotHistory'),
  'locations.view': see('stock', 'locations'),
  'stock.move': act('stock', ACTS.stockMove),
  'stock.adjust': act('stock', ACTS.stockAdjust),
  'locations.create': add('stock', 'locations'),
  'locations.update': change('stock', 'locations'),

  'products.view': see('products', 'products'),
  'products.create': add('products', 'products'),
  'products.update': change('products', 'products'),
  'boms.view': see('products', 'recipes'),
  'boms.create': add('products', 'recipes'),
  'boms.update': change('products', 'recipes'),
  'product_licences.view': see('products', 'licences'),
  'product_licences.create': add('products', 'licences'),
  'product_licences.update': change('products', 'licences'),

  'orders.view': see('orders', 'orders'),
  // Needs orders.view (permissions.ts), so always said after the orders.
  'orders.view_prices': see('orders', 'orderPrices'),
  'orders.create': doing('orders', 'orders', DOING.raise),
  'orders.update': doing(
    'orders',
    'orders',
    DOING.change,
    DOING.confirm,
    DOING.cancel,
  ),
  'orders.receive': act('orders', ACTS.ordersReceive),
  'orders.ship': act('orders', ACTS.ordersShip),

  'production.view': see('production', 'runs'),
  'production.create': doing('production', 'runs', DOING.plan),
  'production.release': doing('production', 'runs', DOING.release),
  'production.complete': act('production', ACTS.productionComplete),
  'production.override_licence': act('production', ACTS.productionOverride),

  'invoices.view': see('invoices', 'invoices', 'creditNotes'),
  'invoices.create': doing('invoices', 'invoices', DOING.draft),
  'invoices.update': doing('invoices', 'drafts', DOING.change),
  'invoices.delete': doing('invoices', 'drafts', DOING.delete),
  'invoices.issue': doing('invoices', 'invoices', DOING.issue, DOING.void),
  'return_authorizations.view': see('invoices', 'returns'),
  'return_authorizations.create': doing('invoices', 'returns', DOING.authorize),
  'return_authorizations.update': doing(
    'invoices',
    'returns',
    DOING.cancel,
    DOING.close,
  ),

  'costs.view': see('costs', 'costs', 'exchangeRates'),
  // It sets exchange rates too (PUT /costs/exchange-rates).
  'costs.update': change('costs', 'costs', 'exchangeRates'),
  'price_lists.view': see('costs', 'priceLists'),
  'price_lists.create': add('costs', 'priceLists'),
  'price_lists.update': change('costs', 'priceLists'),
  'tax_codes.view': see('costs', 'taxCodes'),
  'tax_codes.create': add('costs', 'taxCodes'),
  'tax_codes.update': change('costs', 'taxCodes'),

  'partners.view': see('partners', 'partners'),
  'partners.create': add('partners', 'partners'),
  'partners.update': change('partners', 'partners'),

  'users.view': see('people', 'people'),
  // The role names Members shows beside each member (roles.controller.ts),
  // which no screen shows on their own: it says what users.view says.
  'roles.view': see('people', 'people'),
  'organizations.view': see('people', 'settings'),
  'audit.view': see('people', 'auditLog'),
  'users.create': doing('people', 'members', DOING.invite),
  'users.delete': doing('people', 'members', DOING.remove),
  'roles.assign': act('people', ACTS.rolesAssign),
  'roles.create': doing('people', 'roles', DOING.make),
  'roles.update': doing('people', 'roles', DOING.change),
  'roles.delete': doing('people', 'roles', DOING.delete),
  'organizations.update': change('people', 'settings'),
  'organizations.export': act('people', ACTS.organizationsExport),
  'organizations.delete': act('people', ACTS.organizationsDelete),
};

/**
 * An area's permissions in the order its sentence says them, what is seen
 * first: the role editor's sections (ADR-080), so each box sits in the
 * area whose sentence it changes.
 */
export function permissionsIn(area: Area): Permission[] {
  return (Object.keys(GRANTS) as Permission[]).filter(
    (permission) => GRANTS[permission].area === area,
  );
}

const ORDER = Object.keys(THINGS) as Thing[];

/** One area the reader may touch, and its sentence. */
export interface AccessArea {
  area: Area;
  label: string;
  sentence: string;
}

/**
 * Each area the permissions touch, in order, with its sentence: what may
 * be seen, then the acts, then what may be added and changed.
 */
export function accessAreas(
  intl: IntlShape,
  permissions: readonly Permission[],
): AccessArea[] {
  const held = new Set(permissions);

  return AREAS.flatMap((area) => {
    const grants = (Object.keys(GRANTS) as Permission[])
      .filter((permission) => held.has(permission))
      .map((permission) => GRANTS[permission])
      .filter((grant) => grant.area === area);

    const by = (verb: 'see' | 'add' | 'change') =>
      new Set(
        grants.flatMap((grant) =>
          'verb' in grant && grant.verb === verb ? grant.things : [],
        ),
      );
    const seen = by('see');
    const added = by('add');
    const changed = by('change');

    const things = (keep: (thing: Thing) => boolean, asSeen = false) =>
      ORDER.filter(keep).map((thing) => {
        const words: MessageDescriptor =
          (asSeen && SEEN_AS[thing]) || THINGS[thing];
        return intl.formatMessage(words);
      });
    const said = (verb: MessageDescriptor, list: string[]) =>
      list.length > 0
        ? [intl.formatMessage(verb, { things: intl.formatList(list) })]
        : [];

    // Acts in GRANTS' order, those done to one thing said once, at the
    // first, with every held verb: "raise, change, confirm and cancel
    // orders".
    const doings: (MessageDescriptor | ActedOn)[] = [];
    const verbsOf = new Map<ActedOn, MessageDescriptor[]>();
    for (const grant of grants) {
      if ('act' in grant) {
        if (!doings.includes(grant.act)) doings.push(grant.act);
      } else if ('actsOn' in grant) {
        const verbs = verbsOf.get(grant.actsOn);
        if (verbs) {
          verbs.push(...grant.verbs);
        } else {
          verbsOf.set(grant.actsOn, [...grant.verbs]);
          doings.push(grant.actsOn);
        }
      }
    }
    const acts = doings.map((doing) => {
      if (typeof doing !== 'string') return intl.formatMessage(doing);
      const actedOn: MessageDescriptor = ACTED_ON[doing];
      const verbs = (verbsOf.get(doing) ?? []).map((verb) =>
        intl.formatMessage(verb),
      );
      return intl.formatMessage(actedOn, { verbs: intl.formatList(verbs) });
    });

    const phrases = [
      ...said(
        VERBS.see,
        things(
          (thing) =>
            seen.has(thing) && !added.has(thing) && !changed.has(thing),
          true,
        ),
      ),
      ...acts,
      ...said(
        VERBS.addAndChange,
        things((thing) => added.has(thing) && changed.has(thing)),
      ),
      ...said(
        VERBS.add,
        things((thing) => added.has(thing) && !changed.has(thing)),
      ),
      ...said(
        VERBS.change,
        things((thing) => changed.has(thing) && !added.has(thing)),
      ),
    ];
    if (phrases.length === 0) return [];

    // Phrase from phrase by a semicolon, not by the list's commas and
    // "and", which inside a list of lists run together when read aloud:
    // "correct a count; add and change locations".
    const joined = phrases.reduce((before, after) =>
      intl.formatMessage(
        { id: 'account.access.between', defaultMessage: '{before}; {after}' },
        { before, after },
      ),
    );
    return [
      {
        area,
        label: intl.formatMessage(AREA_LABELS[area]),
        sentence: intl.formatMessage(
          { id: 'account.access.sentence', defaultMessage: '{phrases}.' },
          {
            phrases:
              joined.charAt(0).toLocaleUpperCase(intl.locale) + joined.slice(1),
          },
        ),
      },
    ];
  });
}
