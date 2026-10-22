import { t, type Translatable } from '../../i18n/translate';

/**
 * The permission vocabulary (ADR-004). Single source of truth for the seed,
 * the @RequirePermission decorator, and the guard.
 *
 * Rules that keep this usable as it grows:
 *
 * 1. Name **capabilities, not roles** — `users.create`, never `admin.users`.
 *    A permission that encodes who holds it cannot be rebundled later.
 * 2. Keep the verb set fixed: view / create / update / delete (+ named verbs
 *    like `assign` where the action genuinely differs). Drift — `read`
 *    alongside `view` — means nobody knows which one the guard checks.
 * 3. **Never seed a permission nothing gates.** An ungated permission is a
 *    lie: it appears in the UI as a toggle that does nothing.
 * 4. Self-actions are not permissions. Editing your own profile is implicit
 *    for any authenticated user; permissions govern acting on *others*.
 */
export const PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  // No users.update: another member's details are theirs alone (ADR-063),
  // so nothing would gate it (rule 3). Dropped in migration 0071.
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  // A permission of its own: role assignment is privilege escalation.
  ROLES_ASSIGN: 'roles.assign',
  // Making, changing and deleting roles stay the Owners' (ADR-080): never
  // offered in the editor, so editing a role cannot be used to climb.
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',

  ORGANIZATIONS_VIEW: 'organizations.view',
  ORGANIZATIONS_UPDATE: 'organizations.update',
  // Owner-only (ADR-070). Export apart from delete: everything the
  // organization holds, useful without deleting anything.
  ORGANIZATIONS_EXPORT: 'organizations.export',
  ORGANIZATIONS_DELETE: 'organizations.delete',

  AUDIT_VIEW: 'audit.view',

  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',

  // Separate from products.*: a licence is compliance data, and the person
  // who keeps registrations current is not always the person who edits the
  // catalogue. No delete — a recipe made under one keeps pointing at it.
  PRODUCT_LICENCES_VIEW: 'product_licences.view',
  PRODUCT_LICENCES_CREATE: 'product_licences.create',
  PRODUCT_LICENCES_UPDATE: 'product_licences.update',

  // Separate from organizations.*: what a customer is charged is set by the
  // Owner, but everyone who drafts an invoice picks a code (ADR-046). No
  // delete — an invoice line points at the code it used.
  TAX_CODES_VIEW: 'tax_codes.view',
  TAX_CODES_CREATE: 'tax_codes.create',
  TAX_CODES_UPDATE: 'tax_codes.update',

  // Drafting is operational; issuing is the finance act and gets its own
  // permission with issue itself (ADR-046). Delete is drafts only — an
  // issued invoice is reversed by a credit note, never removed.
  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_UPDATE: 'invoices.update',
  INVOICES_DELETE: 'invoices.delete',
  // The finance act: numbers the invoice and sends it. Owner-only until an
  // organization widens it deliberately (ADR-046).
  INVOICES_ISSUE: 'invoices.issue',

  // Customer service, not the dock or finance (ADR-047): receiving against
  // an RMA stays orders.receive, and crediting one stays invoices.issue.
  RETURN_AUTHORIZATIONS_VIEW: 'return_authorizations.view',
  RETURN_AUTHORIZATIONS_CREATE: 'return_authorizations.create',
  RETURN_AUTHORIZATIONS_UPDATE: 'return_authorizations.update',

  LOCATIONS_VIEW: 'locations.view',
  LOCATIONS_CREATE: 'locations.create',
  LOCATIONS_UPDATE: 'locations.update',

  STOCK_VIEW: 'stock.view',
  STOCK_MOVE: 'stock.move',
  STOCK_ADJUST: 'stock.adjust',

  COSTS_VIEW: 'costs.view',
  COSTS_UPDATE: 'costs.update',

  // Owner-only (ADR-049). Using a list needs none of these: its price
  // reaches a line through the order routes.
  PRICE_LISTS_VIEW: 'price_lists.view',
  PRICE_LISTS_CREATE: 'price_lists.create',
  PRICE_LISTS_UPDATE: 'price_lists.update',

  PARTNERS_VIEW: 'partners.view',
  PARTNERS_CREATE: 'partners.create',
  PARTNERS_UPDATE: 'partners.update',

  ORDERS_VIEW: 'orders.view',
  // An order's line prices, totals and tax, split from orders.view (ADR-080):
  // the dock needs no more than a temp does to see what suppliers are paid.
  ORDERS_VIEW_PRICES: 'orders.view_prices',
  ORDERS_CREATE: 'orders.create',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_RECEIVE: 'orders.receive',
  ORDERS_SHIP: 'orders.ship',

  BOMS_VIEW: 'boms.view',
  BOMS_CREATE: 'boms.create',
  BOMS_UPDATE: 'boms.update',

  PRODUCTION_VIEW: 'production.view',
  PRODUCTION_CREATE: 'production.create',
  PRODUCTION_RELEASE: 'production.release',
  PRODUCTION_COMPLETE: 'production.complete',
  // Releasing under a licence the organization's policy refuses unless
  // someone says why (ADR-050). Separate from release: signing off a lapsed
  // registration is a compliance call, not a floor one. Owner-only until an
  // organization widens it deliberately.
  PRODUCTION_OVERRIDE_LICENCE: 'production.override_licence',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/**
 * Each permission's line, in the reader's language (ADR-080): in the
 * editor's catalogue, the audit log, the export and the refusal, so the
 * four say the same thing. Seeded in English into permissions.description.
 * What a holder can do, put together, is the client's (ADR-079).
 */
export const PERMISSION_DESCRIPTIONS: Record<Permission, Translatable> = {
  'users.view': t({
    id: 'permissions.users.view',
    defaultMessage: 'See who works here',
  }),
  'users.create': t({
    id: 'permissions.users.create',
    defaultMessage: 'Invite people',
  }),
  'users.delete': t({
    id: 'permissions.users.delete',
    defaultMessage: 'Remove a member',
  }),
  'roles.view': t({
    id: 'permissions.roles.view',
    defaultMessage: 'See the roles and what they grant',
  }),
  'roles.assign': t({
    id: 'permissions.roles.assign',
    defaultMessage: 'Change members’ roles',
  }),
  'roles.create': t({
    id: 'permissions.roles.create',
    defaultMessage: 'Make a role',
  }),
  'roles.update': t({
    id: 'permissions.roles.update',
    defaultMessage: 'Change a role',
  }),
  'roles.delete': t({
    id: 'permissions.roles.delete',
    defaultMessage: 'Delete a role',
  }),
  'organizations.view': t({
    id: 'permissions.organizations.view',
    defaultMessage: 'See the organization’s settings',
  }),
  'organizations.update': t({
    id: 'permissions.organizations.update',
    defaultMessage: 'Change the organization’s settings',
  }),
  'organizations.export': t({
    id: 'permissions.organizations.export',
    defaultMessage: 'Download everything the organization holds',
  }),
  'organizations.delete': t({
    id: 'permissions.organizations.delete',
    defaultMessage: 'Close the organization, or cancel its deletion',
  }),
  'audit.view': t({
    id: 'permissions.audit.view',
    defaultMessage: 'Read the audit log',
  }),
  'products.view': t({
    id: 'permissions.products.view',
    defaultMessage: 'See the product catalogue',
  }),
  'products.create': t({
    id: 'permissions.products.create',
    defaultMessage: 'Add a product',
  }),
  'products.update': t({
    id: 'permissions.products.update',
    defaultMessage: 'Edit or discontinue a product',
  }),
  'product_licences.view': t({
    id: 'permissions.productLicences.view',
    defaultMessage: 'See product licences and registrations',
  }),
  'product_licences.create': t({
    id: 'permissions.productLicences.create',
    defaultMessage: 'Record a licence number',
  }),
  'product_licences.update': t({
    id: 'permissions.productLicences.update',
    defaultMessage: 'Correct a licence, or mark it withdrawn',
  }),
  'tax_codes.view': t({
    id: 'permissions.taxCodes.view',
    defaultMessage: 'See tax codes and their rates',
  }),
  'tax_codes.create': t({
    id: 'permissions.taxCodes.create',
    defaultMessage: 'Add a tax code',
  }),
  'tax_codes.update': t({
    id: 'permissions.taxCodes.update',
    defaultMessage: 'Change a tax code’s rates, or retire it',
  }),
  'invoices.view': t({
    id: 'permissions.invoices.view',
    defaultMessage: 'See invoices and credit notes',
  }),
  'invoices.create': t({
    id: 'permissions.invoices.create',
    defaultMessage: 'Draft an invoice for a shipment',
  }),
  'invoices.update': t({
    id: 'permissions.invoices.update',
    defaultMessage: 'Edit a draft invoice’s prices, tax and dates',
  }),
  'invoices.delete': t({
    id: 'permissions.invoices.delete',
    defaultMessage: 'Delete a draft invoice',
  }),
  'invoices.issue': t({
    id: 'permissions.invoices.issue',
    defaultMessage: 'Issue, void or credit an invoice',
  }),
  'return_authorizations.view': t({
    id: 'permissions.returnAuthorizations.view',
    defaultMessage: 'See return authorizations',
  }),
  'return_authorizations.create': t({
    id: 'permissions.returnAuthorizations.create',
    defaultMessage: 'Authorize a customer to send goods back',
  }),
  'return_authorizations.update': t({
    id: 'permissions.returnAuthorizations.update',
    defaultMessage: 'Cancel or close a return authorization',
  }),
  'locations.view': t({
    id: 'permissions.locations.view',
    defaultMessage: 'See warehouses, zones and bins',
  }),
  'locations.create': t({
    id: 'permissions.locations.create',
    defaultMessage: 'Add a location',
  }),
  'locations.update': t({
    id: 'permissions.locations.update',
    defaultMessage: 'Edit, move or retire a location',
  }),
  'stock.view': t({
    id: 'permissions.stock.view',
    defaultMessage: 'See what is on hand and where',
  }),
  // One permission for receiving, shipping, and transferring: each records
  // something that happened in the world, and splitting them would suggest
  // one is riskier than another. Adjustment is separate for the opposite
  // reason — it overrides the record itself.
  'stock.move': t({
    id: 'permissions.stock.move',
    defaultMessage: 'Receive, ship or transfer stock',
  }),
  // Separate from stock.move: an adjustment overrides the record itself, and
  // is the one movement with no external event behind it.
  'stock.adjust': t({
    id: 'permissions.stock.adjust',
    defaultMessage: 'Correct a count when the system is wrong',
  }),
  'costs.view': t({
    id: 'permissions.costs.view',
    defaultMessage: 'See what stock, lots and batches cost, and exchange rates',
  }),
  'costs.update': t({
    id: 'permissions.costs.update',
    defaultMessage: 'Set and correct costs and exchange rates',
  }),
  'price_lists.view': t({
    id: 'permissions.priceLists.view',
    defaultMessage: 'See price lists and the prices on them',
  }),
  'price_lists.create': t({
    id: 'permissions.priceLists.create',
    defaultMessage: 'Add a price list',
  }),
  'price_lists.update': t({
    id: 'permissions.priceLists.update',
    defaultMessage: 'Change prices on a list, rename it or retire it',
  }),
  'partners.view': t({
    id: 'permissions.partners.view',
    defaultMessage: 'See customers and suppliers',
  }),
  'partners.create': t({
    id: 'permissions.partners.create',
    defaultMessage: 'Add a customer or supplier',
  }),
  // No delete: a partner referenced by an order cannot be removed without
  // inventing gaps in the history the order exists to record.
  'partners.update': t({
    id: 'permissions.partners.update',
    defaultMessage: 'Edit or retire a customer or supplier',
  }),
  'orders.view': t({
    id: 'permissions.orders.view',
    defaultMessage: 'See purchase and sales orders',
  }),
  'orders.view_prices': t({
    id: 'permissions.orders.viewPrices',
    defaultMessage: 'See prices on orders',
  }),
  'orders.create': t({
    id: 'permissions.orders.create',
    defaultMessage: 'Raise an order',
  }),
  'orders.update': t({
    id: 'permissions.orders.update',
    defaultMessage: 'Edit, confirm or cancel an order',
  }),
  // Separate from update: receiving writes to the ledger, and the person on
  // the dock is not usually the person who raises orders.
  'orders.receive': t({
    id: 'permissions.orders.receive',
    defaultMessage: 'Receive stock against an order',
  }),
  // Separate from receive and update, for the reason receive is: the person
  // packing boxes is not usually the person raising orders.
  'orders.ship': t({
    id: 'permissions.orders.ship',
    defaultMessage: 'Ship stock against a sales order',
  }),
  'boms.view': t({
    id: 'permissions.boms.view',
    defaultMessage: 'See recipes and what they consume',
  }),
  'boms.create': t({
    id: 'permissions.boms.create',
    defaultMessage: 'Add a recipe or draft a new version of one',
  }),
  'boms.update': t({
    id: 'permissions.boms.update',
    defaultMessage: 'Edit a draft recipe, promote it or archive it',
  }),
  'production.view': t({
    id: 'permissions.production.view',
    defaultMessage: 'See production runs and what they consumed',
  }),
  'production.create': t({
    id: 'permissions.production.create',
    defaultMessage: 'Plan a run',
  }),
  'production.release': t({
    id: 'permissions.production.release',
    defaultMessage: 'Release a run, or cancel one',
  }),
  'production.complete': t({
    id: 'permissions.production.complete',
    defaultMessage: 'Record output and consume components',
  }),
  'production.override_licence': t({
    id: 'permissions.production.overrideLicence',
    defaultMessage:
      'Release a run under an expired or not-yet-in-force licence, with a reason',
  }),
};

/**
 * A permission's line, quoted as each language quotes, where a sentence
 * names it: the refusal, the editor's own refusals and the audit log.
 */
export function quotedLine(key: Permission): Translatable {
  return t(
    { id: 'permissions.quoted', defaultMessage: '“{line}”' },
    { line: PERMISSION_DESCRIPTIONS[key] },
  );
}

/**
 * What each permission needs held with it (ADR-080). The editor ticks a
 * permission's needs with it and unticks whatever needs one cleared, and
 * the server refuses a role that lacks one. Each change needs its view,
 * each act what it acts on, an act that goes further the act it extends
 * (correcting a count, moving stock), and what sets an order's prices the
 * prices. So does whatever a route must be told and only another area
 * shows: the location received into or shipped from, the partner and
 * items of an order, the shipment an invoice is drafted for. Only what a
 * permission needs itself: a need's own needs follow from it.
 * A test holds these to no cycle, and every built-in role and template to
 * them.
 */
export const PERMISSION_NEEDS: Partial<
  Record<Permission, readonly Permission[]>
> = {
  'users.create': ['users.view'],
  'users.delete': ['users.view'],
  'roles.assign': ['roles.view'],
  'roles.create': ['roles.view'],
  'roles.update': ['roles.view'],
  'roles.delete': ['roles.view'],
  'organizations.update': ['organizations.view'],
  'organizations.export': ['organizations.view'],
  'organizations.delete': ['organizations.view'],
  'products.create': ['products.view'],
  'products.update': ['products.view'],
  'product_licences.create': ['product_licences.view'],
  'product_licences.update': ['product_licences.view'],
  'tax_codes.create': ['tax_codes.view'],
  'tax_codes.update': ['tax_codes.view'],
  // A shipment of an order, and a tax code for a line.
  'invoices.create': ['invoices.view', 'orders.view'],
  'invoices.update': ['invoices.view', 'tax_codes.view'],
  'invoices.delete': ['invoices.view'],
  'invoices.issue': ['invoices.view'],
  // The order it is raised against, and the return linked to it. Raising a
  // replacement makes a sale, so that route also requires orders.create;
  // not a need here, since cancelling and closing make none.
  'return_authorizations.create': ['return_authorizations.view', 'orders.view'],
  'return_authorizations.update': ['return_authorizations.view', 'orders.view'],
  'locations.create': ['locations.view'],
  'locations.update': ['locations.view'],
  // Receiving names the item and where it goes.
  'stock.move': ['stock.view', 'products.view', 'locations.view'],
  'stock.adjust': ['stock.move'],
  'costs.update': ['costs.view'],
  'price_lists.create': ['price_lists.view'],
  'price_lists.update': ['price_lists.view', 'products.view'],
  'partners.create': ['partners.view'],
  'partners.update': ['partners.view'],
  'orders.view_prices': ['orders.view'],
  'orders.create': ['orders.view_prices', 'partners.view', 'products.view'],
  // Adding a line names its item.
  'orders.update': ['orders.view_prices', 'products.view'],
  'orders.receive': ['orders.view', 'locations.view'],
  'orders.ship': ['orders.view', 'locations.view'],
  'boms.create': ['boms.view', 'products.view'],
  'boms.update': ['boms.view', 'products.view'],
  // What a run makes and where; where release takes its components from.
  'production.create': ['production.view', 'products.view', 'locations.view'],
  'production.release': ['production.view', 'locations.view'],
  'production.complete': ['production.view'],
  'production.override_licence': ['production.release'],
};

/**
 * Every role's (ADR-080), shown ticked and locked in the editor: seeing who
 * works here, the roles and the organization's settings. Every built-in
 * role holds them, People and Members are for everyone (ADR-063), and the
 * screens built so far read the organization's settings without asking.
 */
export const LOCKED_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.ROLES_VIEW,
  PERMISSIONS.ORGANIZATIONS_VIEW,
];

/**
 * What stays the Owners' (ADR-080), never offered in the editor: making,
 * changing and deleting roles, and closing the organization (ADR-070).
 * Only Owners edit roles and an Owner holds everything, so editing a role
 * cannot be used to climb.
 */
export const NEVER_OFFERED: readonly Permission[] = [
  PERMISSIONS.ROLES_CREATE,
  PERMISSIONS.ROLES_UPDATE,
  PERMISSIONS.ROLES_DELETE,
  PERMISSIONS.ORGANIZATIONS_DELETE,
];

/**
 * Who is told (ADR-080). Three notifications go to whoever holds a
 * permission, so a made role changes who that is: named here once, for
 * the services that send them (licence-reminders.service.ts,
 * order-lines.service.ts, production-close.service.ts) and for the
 * line each of those permissions has in the editor (PERMISSION_NOTES).
 */
export const TOLD = {
  licenceExpiring: [
    PERMISSIONS.PRODUCT_LICENCES_UPDATE,
    PERMISSIONS.PRODUCTION_RELEASE,
  ],
  closedShort: [PERMISSIONS.ORDERS_UPDATE],
  variance: [PERMISSIONS.PRODUCTION_COMPLETE],
} as const satisfies Record<string, readonly Permission[]>;

const TOLD_NOTES: Record<keyof typeof TOLD, Translatable> = {
  licenceExpiring: t({
    id: 'permissions.note.licenceExpiring',
    defaultMessage:
      'Also told when a licence is about to expire, and when it does.',
  }),
  closedShort: t({
    id: 'permissions.note.closedShort',
    defaultMessage: 'Also told when an order line closes short.',
  }),
  variance: t({
    id: 'permissions.note.variance',
    defaultMessage: 'Also told when a run closes off its plan.',
  }),
};

/** A told permission's line in the editor: "Also told when …". */
export const PERMISSION_NOTES: Partial<Record<Permission, Translatable>> =
  Object.fromEntries(
    (
      Object.entries(TOLD) as [keyof typeof TOLD, readonly Permission[]][]
    ).flatMap(([told, keys]) =>
      keys.map((key): [Permission, Translatable] => [key, TOLD_NOTES[told]]),
    ),
  );

export const SYSTEM_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  VIEWER: 'Viewer',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Which permissions each seeded role grants.
 *
 * Owner is deliberately `ALL_PERMISSIONS`, so a permission added later is
 * granted automatically — an organization with no one able to perform a new
 * action is unrecoverable without a migration.
 *
 * Admin and Viewer are **explicit allow-lists, never deny-lists.** A new
 * permission must default to Owner-only and be widened by a deliberate edit
 * here. Written as `ALL_PERMISSIONS.filter(...)`, adding `billing.charge`
 * would silently grant it to every Admin in every organization.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<
  SystemRole,
  readonly Permission[]
> = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,

  [SYSTEM_ROLES.ADMIN]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_ASSIGN,
    PERMISSIONS.ORGANIZATIONS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_CREATE,
    PERMISSIONS.PRODUCTS_UPDATE,
    PERMISSIONS.PRODUCT_LICENCES_VIEW,
    PERMISSIONS.PRODUCT_LICENCES_CREATE,
    PERMISSIONS.PRODUCT_LICENCES_UPDATE,
    PERMISSIONS.TAX_CODES_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.INVOICES_CREATE,
    PERMISSIONS.INVOICES_UPDATE,
    PERMISSIONS.INVOICES_DELETE,
    PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW,
    PERMISSIONS.RETURN_AUTHORIZATIONS_CREATE,
    PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE,
    PERMISSIONS.BOMS_VIEW,
    PERMISSIONS.BOMS_CREATE,
    PERMISSIONS.BOMS_UPDATE,
    PERMISSIONS.LOCATIONS_VIEW,
    PERMISSIONS.LOCATIONS_CREATE,
    PERMISSIONS.LOCATIONS_UPDATE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_MOVE,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.PARTNERS_VIEW,
    PERMISSIONS.PARTNERS_CREATE,
    PERMISSIONS.PARTNERS_UPDATE,
    PERMISSIONS.ORDERS_VIEW,
    // Split from orders.view, which Admin held, so it keeps it (ADR-080).
    PERMISSIONS.ORDERS_VIEW_PRICES,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.ORDERS_RECEIVE,
    PERMISSIONS.ORDERS_SHIP,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.PRODUCTION_CREATE,
    PERMISSIONS.PRODUCTION_RELEASE,
    PERMISSIONS.PRODUCTION_COMPLETE,
  ],

  [SYSTEM_ROLES.VIEWER]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ORGANIZATIONS_VIEW,
    // Read-only means read: a Viewer sees the catalogue and changes nothing.
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCT_LICENCES_VIEW,
    PERMISSIONS.TAX_CODES_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW,
    PERMISSIONS.BOMS_VIEW,
    PERMISSIONS.LOCATIONS_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.PARTNERS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    // As Admin's: split from orders.view, which Viewer held (ADR-080).
    PERMISSIONS.ORDERS_VIEW_PRICES,
  ],
};

/**
 * A duplicate inside one role's list is a primary-key violation in
 * role_permissions the first time an organization is provisioned — reported by
 * the auth controller as a duplicate email, which sends everyone to the wrong
 * table. Cheaper to refuse at import time than to debug at runtime.
 */
for (const [role, keys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${role} lists a permission twice`);
  }
}

/**
 * Each system role by what it lets a person do, in a line a newcomer
 * understands (ADR-077): on the Invite dialog, the invitation page and the
 * email, translated by key as the role names are (ADR-054). When the roles
 * change, these change with them. Never stored: roles.description holds a
 * made role's line alone (ADR-080), and the export writes these in its
 * language.
 */
export const SYSTEM_ROLE_DESCRIPTIONS: Record<SystemRole, Translatable> = {
  [SYSTEM_ROLES.OWNER]: t({
    id: 'roles.description.owner',
    defaultMessage:
      'Everything, including costs, issuing invoices, settings and closing the organization.',
  }),
  [SYSTEM_ROLES.ADMIN]: t({
    id: 'roles.description.admin',
    defaultMessage:
      'Day-to-day work: stock, orders, production and drafting invoices. Can invite and remove members.',
  }),
  [SYSTEM_ROLES.VIEWER]: t({
    id: 'roles.description.viewer',
    defaultMessage: 'Looks at orders, stock and invoices, and changes nothing.',
  }),
};

interface RoleTemplate {
  name: Translatable;
  permissions: readonly Permission[];
}

/**
 * Where making a role starts (ADR-080): a name in the reader's language
 * and boxes ticked, a start only, which an Owner changes as they like.
 * Each holds the three every role holds and what each of its permissions
 * needs, and nothing never offered; a test holds each to that. Warehouse,
 * Production and Stock look-up leave prices on orders out.
 */
export const ROLE_TEMPLATES = {
  warehouse: {
    name: t({ id: 'roles.template.warehouse', defaultMessage: 'Warehouse' }),
    permissions: [
      ...LOCKED_PERMISSIONS,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.LOCATIONS_VIEW,
      PERMISSIONS.STOCK_MOVE,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCT_LICENCES_VIEW,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_RECEIVE,
      PERMISSIONS.ORDERS_SHIP,
    ],
  },
  sales: {
    name: t({ id: 'roles.template.sales', defaultMessage: 'Sales' }),
    permissions: [
      ...LOCKED_PERMISSIONS,
      PERMISSIONS.PARTNERS_VIEW,
      PERMISSIONS.PARTNERS_CREATE,
      PERMISSIONS.PARTNERS_UPDATE,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_VIEW_PRICES,
      PERMISSIONS.ORDERS_CREATE,
      PERMISSIONS.ORDERS_UPDATE,
      PERMISSIONS.INVOICES_VIEW,
      PERMISSIONS.INVOICES_CREATE,
      PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW,
      PERMISSIONS.RETURN_AUTHORIZATIONS_CREATE,
      PERMISSIONS.PRICE_LISTS_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.STOCK_VIEW,
    ],
  },
  finance: {
    name: t({ id: 'roles.template.finance', defaultMessage: 'Finance' }),
    permissions: [
      ...LOCKED_PERMISSIONS,
      PERMISSIONS.INVOICES_VIEW,
      PERMISSIONS.INVOICES_CREATE,
      PERMISSIONS.INVOICES_UPDATE,
      PERMISSIONS.INVOICES_DELETE,
      PERMISSIONS.INVOICES_ISSUE,
      PERMISSIONS.COSTS_VIEW,
      PERMISSIONS.COSTS_UPDATE,
      PERMISSIONS.PRICE_LISTS_VIEW,
      PERMISSIONS.PRICE_LISTS_CREATE,
      PERMISSIONS.PRICE_LISTS_UPDATE,
      PERMISSIONS.TAX_CODES_VIEW,
      PERMISSIONS.TAX_CODES_CREATE,
      PERMISSIONS.TAX_CODES_UPDATE,
      PERMISSIONS.PARTNERS_VIEW,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_VIEW_PRICES,
      PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW,
      PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
    ],
  },
  production: {
    name: t({ id: 'roles.template.production', defaultMessage: 'Production' }),
    permissions: [
      ...LOCKED_PERMISSIONS,
      PERMISSIONS.BOMS_VIEW,
      PERMISSIONS.BOMS_CREATE,
      PERMISSIONS.BOMS_UPDATE,
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.PRODUCTION_CREATE,
      PERMISSIONS.PRODUCTION_RELEASE,
      PERMISSIONS.PRODUCTION_COMPLETE,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCT_LICENCES_VIEW,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.LOCATIONS_VIEW,
    ],
  },
  stock_lookup: {
    name: t({
      id: 'roles.template.stockLookup',
      defaultMessage: 'Stock look-up',
    }),
    permissions: [
      ...LOCKED_PERMISSIONS,
      PERMISSIONS.STOCK_VIEW,
      PERMISSIONS.LOCATIONS_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
    ],
  },
} satisfies Record<string, RoleTemplate>;

export type RoleTemplateKey = keyof typeof ROLE_TEMPLATES;

/**
 * Known gap (ADR-004), closed elsewhere: nothing here prevents giving a role
 * that grants more than the giver holds. Permission strings cannot express
 * "not above your own level", so that rule, giving only what you hold
 * (ADR-080), lives in giving.ts rather than in the guard.
 */
