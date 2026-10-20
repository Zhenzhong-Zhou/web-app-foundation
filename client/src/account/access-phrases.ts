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
 * "correct a count". An area's phrases are joined as the reader's language
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
  ordersCreate: {
    id: 'account.access.act.ordersCreate',
    defaultMessage: 'raise orders',
  },
  ordersUpdate: {
    id: 'account.access.act.ordersUpdate',
    defaultMessage: 'change, confirm and cancel orders',
  },
  ordersReceive: {
    id: 'account.access.act.ordersReceive',
    defaultMessage: 'receive what was ordered',
  },
  ordersShip: {
    id: 'account.access.act.ordersShip',
    defaultMessage: 'ship what was sold',
  },
  productionCreate: {
    id: 'account.access.act.productionCreate',
    defaultMessage: 'plan runs',
  },
  productionRelease: {
    id: 'account.access.act.productionRelease',
    defaultMessage: 'release runs',
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
  invoicesCreate: {
    id: 'account.access.act.invoicesCreate',
    defaultMessage: 'draft invoices',
  },
  invoicesUpdate: {
    id: 'account.access.act.invoicesUpdate',
    defaultMessage: 'change drafts',
  },
  invoicesDelete: {
    id: 'account.access.act.invoicesDelete',
    defaultMessage: 'delete drafts',
  },
  invoicesIssue: {
    id: 'account.access.act.invoicesIssue',
    defaultMessage: 'issue and void invoices',
  },
  returnsCreate: {
    id: 'account.access.act.returnsCreate',
    defaultMessage: 'authorize returns',
  },
  returnsUpdate: {
    id: 'account.access.act.returnsUpdate',
    defaultMessage: 'cancel and close returns',
  },
  usersCreate: {
    id: 'account.access.act.usersCreate',
    defaultMessage: 'invite members',
  },
  usersDelete: {
    id: 'account.access.act.usersDelete',
    defaultMessage: 'remove members',
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

type Grant =
  | { area: Area; verb: 'see' | 'add' | 'change'; things: readonly Thing[] }
  | { area: Area; act: MessageDescriptor };

const see = (area: Area, ...things: Thing[]): Grant => ({
  area,
  verb: 'see',
  things,
});
const add = (area: Area, thing: Thing): Grant => ({
  area,
  verb: 'add',
  things: [thing],
});
const change = (area: Area, thing: Thing): Grant => ({
  area,
  verb: 'change',
  things: [thing],
});
const act = (area: Area, words: MessageDescriptor): Grant => ({
  area,
  act: words,
});

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
  'orders.create': act('orders', ACTS.ordersCreate),
  'orders.update': act('orders', ACTS.ordersUpdate),
  'orders.receive': act('orders', ACTS.ordersReceive),
  'orders.ship': act('orders', ACTS.ordersShip),

  'production.view': see('production', 'runs'),
  'production.create': act('production', ACTS.productionCreate),
  'production.release': act('production', ACTS.productionRelease),
  'production.complete': act('production', ACTS.productionComplete),
  'production.override_licence': act('production', ACTS.productionOverride),

  'invoices.view': see('invoices', 'invoices', 'creditNotes'),
  'invoices.create': act('invoices', ACTS.invoicesCreate),
  'invoices.update': act('invoices', ACTS.invoicesUpdate),
  'invoices.delete': act('invoices', ACTS.invoicesDelete),
  'invoices.issue': act('invoices', ACTS.invoicesIssue),
  'return_authorizations.view': see('invoices', 'returns'),
  'return_authorizations.create': act('invoices', ACTS.returnsCreate),
  'return_authorizations.update': act('invoices', ACTS.returnsUpdate),

  'costs.view': see('costs', 'costs', 'exchangeRates'),
  'costs.update': change('costs', 'costs'),
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
  // Nothing reads it apart from users.view (roles.controller.ts), so it
  // says what users.view says.
  'roles.view': see('people', 'people'),
  'organizations.view': see('people', 'settings'),
  'audit.view': see('people', 'auditLog'),
  'users.create': act('people', ACTS.usersCreate),
  'users.delete': act('people', ACTS.usersDelete),
  'roles.assign': act('people', ACTS.rolesAssign),
  'organizations.update': change('people', 'settings'),
  'organizations.export': act('people', ACTS.organizationsExport),
  'organizations.delete': act('people', ACTS.organizationsDelete),
};

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

    const acts = [
      ...new Set(
        grants.flatMap((grant) => ('act' in grant ? [grant.act] : [])),
      ),
    ].map((words) => intl.formatMessage(words));

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

    const joined = intl.formatList(phrases);
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
