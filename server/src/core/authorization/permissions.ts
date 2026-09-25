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
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  // Separate from users.update on purpose: renaming someone and making them an
  // Owner are different risk levels. Role assignment is privilege escalation.
  ROLES_ASSIGN: 'roles.assign',

  ORGANIZATIONS_VIEW: 'organizations.view',
  ORGANIZATIONS_UPDATE: 'organizations.update',

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

  LOCATIONS_VIEW: 'locations.view',
  LOCATIONS_CREATE: 'locations.create',
  LOCATIONS_UPDATE: 'locations.update',

  STOCK_VIEW: 'stock.view',
  STOCK_MOVE: 'stock.move',
  STOCK_ADJUST: 'stock.adjust',

  PARTNERS_VIEW: 'partners.view',
  PARTNERS_CREATE: 'partners.create',
  PARTNERS_UPDATE: 'partners.update',

  ORDERS_VIEW: 'orders.view',
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
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/** Shown in the role editor; seeded into permissions.description. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users.view': 'See the list of members',
  'users.create': 'Add a user to the organization',
  'users.update': 'Edit another member’s details',
  'users.delete': 'Remove or suspend a member',
  'roles.view': 'See roles and the permissions they grant',
  'roles.assign': 'Change which role a member holds',
  'organizations.view': 'See organization settings',
  'organizations.update': 'Change organization settings',
  'audit.view': 'Read the audit log',
  'products.view': 'See the product catalogue',
  'products.create': 'Add a product to the catalogue',
  'products.update': 'Edit or discontinue a product',
  'product_licences.view': 'See product licences and registrations',
  'product_licences.create': 'Record a licence number',
  'product_licences.update': 'Correct a licence, or mark it withdrawn',
  'tax_codes.view': 'See tax codes and their rates',
  'tax_codes.create': 'Add a tax code',
  'tax_codes.update': 'Change a tax code’s rates, or retire it',
  'invoices.view': 'See invoices',
  'invoices.create': 'Draft an invoice for a shipment',
  'invoices.update': 'Edit a draft invoice’s prices, tax and dates',
  'invoices.delete': 'Delete a draft invoice',
  'locations.view': 'See warehouses, zones, and bins',
  'locations.create': 'Add a location',
  'locations.update': 'Edit, move, or retire a location',
  'stock.view': 'See what is on hand and where',
  // One permission for receiving, shipping, and transferring: each records
  // something that happened in the world, and splitting them would suggest
  // one is riskier than another. Adjustment is separate for the opposite
  // reason — it overrides the record itself.
  'stock.move': 'Receive, ship, or transfer stock',
  // Separate from stock.move: an adjustment overrides the record itself, and
  // is the one movement with no external event behind it.
  'stock.adjust': 'Correct a count when the system is wrong',
  'partners.view': 'See customers and suppliers',
  'partners.create': 'Add a customer or supplier',
  // No delete: a partner referenced by an order cannot be removed without
  // inventing gaps in the history the order exists to record.
  'partners.update': 'Edit or retire a customer or supplier',
  'orders.view': 'See purchase and sales orders',
  'orders.create': 'Raise an order',
  'orders.update': 'Edit, confirm, or cancel an order',
  // Separate from update: receiving writes to the ledger, and the person on
  // the dock is not usually the person who raises orders.
  'orders.receive': 'Receive stock against an order',
  // Separate from receive and update, for the reason receive is: the person
  // packing boxes is not usually the person raising orders.
  'orders.ship': 'Ship stock against a sales order',
  'boms.view': 'See recipes and what they consume',
  'boms.create': 'Add a recipe or draft a new version of one',
  'boms.update': 'Edit a draft, promote it, or archive it',
  'production.view': 'See production runs and what they consumed',
  'production.create': 'Plan a run',
  'production.release': 'Issue components to a run, or cancel one',
  'production.complete': 'Record output and consume components',
};

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
    PERMISSIONS.USERS_UPDATE,
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
    PERMISSIONS.BOMS_VIEW,
    PERMISSIONS.LOCATIONS_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.PARTNERS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
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

export const SYSTEM_ROLE_DESCRIPTIONS: Record<SystemRole, string> = {
  [SYSTEM_ROLES.OWNER]: 'Full control of the organization',
  [SYSTEM_ROLES.ADMIN]: 'Manage members and roles',
  [SYSTEM_ROLES.VIEWER]: 'Read-only access',
};

/**
 * Known gap (ADR-004), closed elsewhere: nothing here prevents an Admin
 * assigning the Owner role. Permission strings cannot express "not above your
 * own level", so that rule lives in UsersService.updateRole() rather than in
 * the guard.
 */
