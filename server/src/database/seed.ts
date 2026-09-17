import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, inArray } from 'drizzle-orm';

import { AppModule } from '../app.module';
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRole,
} from '../core/authorization/permissions';
import {
  organizationExists,
  provisionOrganization,
} from '../core/organizations/provision-organization';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import { permissions, rolePermissions, roles } from './schema';

const DEFAULT_ORG = { name: 'Default Organization', slug: 'default' };

/**
 * Rows per insert in the grant backfill.
 *
 * A multi-row insert carries two bind parameters per row against a hard limit
 * of 65535, so this could be far larger — 500 is small enough that the number
 * never needs thinking about again, and the cost is a handful of round trips
 * on a script that runs once per deploy.
 */
const GRANT_CHUNK = 500;

/**
 * Seeds the permission vocabulary and the default organization (ADR-003).
 *
 * **Idempotent by design.** You will run this repeatedly while building steps
 * 3 and 4 — after a schema change, after a reset, after adding a permission.
 * A seed that only works against a virgin database forces `docker compose
 * down -v` for every re-run, which throws away everything else too.
 *
 * Never run automatically on boot. With two instances deployed, both would
 * seed simultaneously and race; seeding belongs in a deploy step that runs
 * once, before instances start.
 *
 * Uses the unscoped handle deliberately: permissions are global, and the
 * default organization is the tenant being created, so there is no tenant
 * context to scope to.
 */
async function seed(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);

    /**
     * 1. Permission vocabulary. Global, so this runs once regardless of orgs.
     *
     * Not chunked, unlike the backfill below: this is bounded by the
     * vocabulary rather than by tenants, so it cannot grow with use.
     */
    await db
      .insert(permissions)
      .values(
        ALL_PERMISSIONS.map((key) => ({
          key,
          description: PERMISSION_DESCRIPTIONS[key],
        })),
      )
      .onConflictDoNothing({ target: permissions.key });

    logger.log(`Permissions: ${ALL_PERMISSIONS.length} keys ensured`);

    // 2. Default organization, with its three system roles and grants.
    await db.transaction(async (tx) => {
      if (await organizationExists(tx, DEFAULT_ORG.slug)) {
        logger.log(`Organization "${DEFAULT_ORG.slug}" already exists`);
        return;
      }

      await provisionOrganization(tx, DEFAULT_ORG);
      logger.log(`Organization "${DEFAULT_ORG.slug}" provisioned`);
    });

    // 3. Backfill grants for every existing organization.
    //
    // Step 2 skips orgs that already exist, so without this a permission added
    // later would never reach roles created before it — the Owner of an older
    // org would get an inexplicable 403 on a new endpoint.
    const added = await syncSystemRoleGrants(db);
    logger.log(
      added > 0 ? `Backfilled ${added} role grants` : 'Role grants up to date',
    );
  } finally {
    await app.close();
  }
}

/**
 * Grants every system role the permissions it should hold, for all
 * organizations. Insert-only and conflict-tolerant, so it adds what is missing
 * and touches nothing else.
 *
 * Deliberately does **not** revoke. A grant present here but absent from
 * SYSTEM_ROLE_PERMISSIONS may have been added on purpose by an administrator,
 * and a seed script silently removing someone's access is worse than the drift.
 */
async function syncSystemRoleGrants(db: Database): Promise<number> {
  const systemRoles = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.isSystem, true));

  if (systemRoles.length === 0) return 0;

  const wantedKeys = [
    ...new Set(Object.values(SYSTEM_ROLE_PERMISSIONS).flat()),
  ];

  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, wantedKeys));

  const idByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  const grants = systemRoles.flatMap((role) =>
    (SYSTEM_ROLE_PERMISSIONS[role.name as SystemRole] ?? []).flatMap((key) => {
      const permissionId = idByKey.get(key);
      return permissionId ? [{ roleId: role.id, permissionId }] : [];
    }),
  );

  if (grants.length === 0) return 0;

  /**
   * Chunked, because this is the one insert here that grows with use:
   * organizations × system roles × permissions. An e2e database with a few
   * hundred organizations produced over a thousand rows in one statement and
   * failed with "bind message has 2208 parameter formats but 0 parameters".
   *
   * Dropping the database clears it, which is why it is worth fixing rather
   * than working around — the count grows back on every run, and the error
   * means nothing on the day it returns.
   */
  let inserted = 0;

  for (let start = 0; start < grants.length; start += GRANT_CHUNK) {
    const rows = await db
      .insert(rolePermissions)
      .values(grants.slice(start, start + GRANT_CHUNK))
      .onConflictDoNothing()
      .returning();

    inserted += rows.length;
  }

  return inserted;
}

void seed();
