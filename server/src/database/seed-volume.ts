import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { AuthService } from '../core/auth/auth.service';
import { PasswordService } from '../core/auth/password.service';
import { giveRoles, nameRoles } from '../core/authorization/member-roles';
import { RolesService } from '../core/authorization/roles.service';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import { invitations, memberships, roles, users } from './schema';
import { runInTenantContext } from './tenant-context';
import { Random } from './volume/random';
import { manifestPath, type Scale, SCALES, VOLUMES } from './volume/scale';
import { servicesOf } from './volume/services';
import { type Anchors, OrganizationWriter } from './volume/write-organization';
import { type TeamAnchors, writeTeam } from './volume/write-team';

/**
 * A year of data for several organizations, for measuring (ADR-051), and
 * the team each one's Owner works with (ADR-081).
 *
 * Separate from seed:demo, which tells a story on one product, and never
 * part of `seed`, which runs on every deploy. Through the same services the
 * API calls, so stock levels, valuations and the ledger agree as they would
 * after a real year; a bulk-SQL path only if this proves too slow to run.
 *
 * Usage, from `server/`, against a database of its own:
 *
 *     npm run seed:volume -- --scale small
 *     npm run seed:volume -- --scale large --organizations 5 --seed 51
 *
 * Every run registers new organizations, stamped with the time, so nothing
 * collides with an earlier run. What perf needs to sign in and find its way
 * — emails, the password, a few ids — is written to
 * perf/volume-<scale>.json.
 */

const PASSWORD = 'volume-password-2026';

/** Counted per organization once seeding ends, for the manifest. */
const COUNTED = [
  'memberships',
  'products',
  'partners',
  'orders',
  'order_lines',
  'lots',
  'shipments',
  'production_orders',
  'invoices',
  'credit_notes',
  'stock_levels',
  'stock_movements',
  'stock_valuations',
] as const;

interface Account {
  email: string;
  userId: string;
  organizationId: string;
  /**
   * An Admin who joined today, invited by the Owner with a note: whose
   * Home perf reads as a newcomer's, the welcome and all (ADR-079).
   */
  newcomerEmail: string;
}

interface Options {
  scale: Scale;
  organizations: number;
  seed: number;
}

export interface VolumeManifest {
  scale: Scale;
  seed: number;
  seededAt: string;
  password: string;
  organizations: (Account &
    Anchors &
    TeamAnchors & { newcomerUserId: string; counts: Record<string, number> })[];
}

async function seedVolume(): Promise<void> {
  const logger = new ConsoleLogger('SeedVolume');

  if (process.env.NODE_ENV === 'production') {
    logger.error('Refusing to write volume data to a production database');
    process.exitCode = 1;
    return;
  }

  const options = parseOptions(process.argv.slice(2));

  if (typeof options === 'string') {
    logger.error(options);
    process.exitCode = 1;
    return;
  }

  /**
   * Warnings and errors only from the app. Every service logs each write
   * at log level, which is tens of thousands of lines here, and printing
   * them costs more than some of the writes. The seed's own progress goes
   * through ConsoleLogger instances, which the app's level does not mute.
   */
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);
    const auth = app.get(AuthService);
    const services = servicesOf(app);
    const volume = VOLUMES[options.scale];
    const started = Date.now();

    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 13);

    // One after another: argon2id is slow on purpose, and five of them in
    // parallel only contend for the same cores.
    const accounts: Account[] = [];

    for (let index = 1; index <= options.organizations; index++) {
      const email = `volume-${options.scale}-${index}-${stamp}@example.com`;

      const { user } = await auth.register({
        email,
        password: PASSWORD,
        name: `Volume Owner ${index}`,
        organizationName: `Volume ${options.scale} ${index} ${stamp}`,
      });

      if (!user.organizationId) {
        throw new Error('Registration created no organization');
      }

      accounts.push({
        email,
        userId: user.id,
        organizationId: user.organizationId,
        newcomerEmail: `volume-${options.scale}-${index}-${stamp}-new@example.com`,
      });
    }

    logger.log(
      `Seeding ${options.organizations} organizations at ${options.scale} scale, seed ${options.seed}`,
    );

    /**
     * In parallel, each in its own tenant context, as concurrent requests
     * from different organizations are. allSettled rather than all: one
     * organization failing must not close the app under the others while
     * they are mid-transaction.
     */
    const results = await Promise.allSettled(
      accounts.map((account, index) =>
        runInTenantContext(
          { userId: account.userId, organizationId: account.organizationId },
          () =>
            new OrganizationWriter(
              services,
              volume,
              new Random(options.seed + index),
              account.userId,
              new ConsoleLogger(`SeedVolume ${index + 1}`),
            ).write(),
        ),
      ),
    );

    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) throw failed.reason;

    const anchors = results.map(
      (result) => (result as PromiseFulfilledResult<Anchors>).value,
    );

    // Last, so they join after the year the Owner made: the team, then
    // the newcomer, the last of all to join.
    const passwordHash = await app.get(PasswordService).hash(PASSWORD);
    const roles = app.get(RolesService);
    const teams: TeamAnchors[] = [];
    const newcomers: string[] = [];
    for (const [index, account] of accounts.entries()) {
      teams.push(
        await runInTenantContext(
          { userId: account.userId, organizationId: account.organizationId },
          () =>
            writeTeam(
              roles,
              db,
              volume,
              new Random(options.seed + index),
              account,
              passwordHash,
            ),
        ),
      );
      newcomers.push(await addNewcomer(db, account, passwordHash));
    }

    // Fresh statistics, so the plan check and the first perf run see the
    // planner's view of this data rather than of an empty database.
    await db.execute(sql`analyze`);

    const counts = await countRows(
      db,
      accounts.map((account) => account.organizationId),
    );

    const manifest: VolumeManifest = {
      scale: options.scale,
      seed: options.seed,
      seededAt: new Date().toISOString(),
      password: PASSWORD,
      organizations: accounts.map((account, index) => ({
        ...account,
        ...anchors[index],
        ...teams[index],
        newcomerUserId: newcomers[index],
        counts: counts.get(account.organizationId) ?? {},
      })),
    };

    const manifestFile = manifestPath(options.scale);
    mkdirSync(dirname(manifestFile), { recursive: true });
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    const first = manifest.organizations[0].counts;

    logger.log(
      `Done in ${minutes} min. Each organization holds about ${first.memberships} members, ${first.orders} orders, ${first.lots} lots, ${first.invoices} invoices and ${first.stock_movements} stock movements.`,
    );
    logger.log(
      `Sign in as ${accounts[0].email} with password ${PASSWORD}. Manifest: ${manifestFile}`,
    );
  } finally {
    await app.close();
  }
}

/**
 * The organization's newcomer (ADR-079): an Admin, so the first week has
 * work for the audit log to tick, who joined today by the Owner's emailed
 * invitation, confirmed by it. Written as accepting leaves it rather than
 * through the link, which is not what perf measures.
 */
async function addNewcomer(
  db: Database,
  account: Account,
  passwordHash: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, account.organizationId),
          eq(roles.name, 'Admin'),
        ),
      );
    const [user] = await tx
      .insert(users)
      .values({
        email: account.newcomerEmail,
        name: 'Volume Newcomer',
        passwordHash,
        emailVerifiedAt: sql`now()`,
      })
      .returning({ id: users.id });
    const [membership] = await tx
      .insert(memberships)
      .values({ userId: user.id, organizationId: account.organizationId })
      .returning({ id: memberships.id });
    await giveRoles(
      tx,
      { id: membership.id, organizationId: account.organizationId },
      [admin.id],
    );
    const [invitation] = await tx
      .insert(invitations)
      .values({
        organizationId: account.organizationId,
        email: account.newcomerEmail,
        locale: 'en',
        note: 'Welcome! Start with the Products list, then receive the next delivery.',
        invitedBy: account.userId,
        link: 'emailed',
        expiresAt: sql`now() + interval '7 days'`,
        membershipId: membership.id,
        acceptedAt: sql`now()`,
      })
      .returning({ id: invitations.id });
    await nameRoles(
      tx,
      { id: invitation.id, organizationId: account.organizationId },
      [admin.id],
    );
    return user.id;
  });
}

function parseOptions(args: string[]): Options | string {
  const options: Options = { scale: 'small', organizations: 5, seed: 51 };

  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];

    if (flag === '--scale') {
      if (!SCALES.includes(value as Scale)) {
        return `--scale must be one of ${SCALES.join(', ')}`;
      }
      options.scale = value as Scale;
    } else if (flag === '--organizations' || flag === '--seed') {
      const number = Number(value);

      if (!Number.isInteger(number) || number < 1) {
        return `${flag} takes a whole number of at least 1`;
      }

      if (flag === '--seed') options.seed = number;
      else options.organizations = number;
    } else {
      return `Unknown option ${flag}. Use --scale small|large, --organizations n, --seed n`;
    }
  }

  return options;
}

/** Rows per table per organization: what a report says it ran against. */
async function countRows(
  db: Database,
  organizationIds: string[],
): Promise<Map<string, Record<string, number>>> {
  const counts = new Map<string, Record<string, number>>(
    organizationIds.map((id) => [id, {}]),
  );

  for (const table of COUNTED) {
    const { rows } = await db.execute(sql`
      select organization_id, count(*)::int as n
      from ${sql.raw(table)}
      where organization_id in ${organizationIds}
      group by organization_id
    `);

    for (const row of rows as { organization_id: string; n: number }[]) {
      counts.get(row.organization_id)![table] = row.n;
    }
  }

  return counts;
}

void seedVolume();
