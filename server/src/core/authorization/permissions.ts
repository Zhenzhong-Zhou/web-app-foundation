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
  ],

  [SYSTEM_ROLES.VIEWER]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ORGANIZATIONS_VIEW,
  ],
};

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
