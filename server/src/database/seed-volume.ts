import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { AuthService } from '../core/auth/auth.service';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import { runInTenantContext } from './tenant-context';
import { Random } from './volume/random';
import { type Scale, SCALES, VOLUMES } from './volume/scale';
import { servicesOf } from './volume/services';
import { type Anchors, OrganizationWriter } from './volume/write-organization';

/**
 * A year of data for several organizations, for measuring (ADR-051).
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
 * — emails, the password, a few ids — is written to perf/volume.json.
 */

const PASSWORD = 'volume-password-2026';

/** Beside the perf scripts that read it; gitignored. */
const MANIFEST = resolve(__dirname, '..', '..', 'perf', 'volume.json');

/** Counted per organization once seeding ends, for the manifest. */
const COUNTED = [
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
  organizations: (Account & Anchors & { counts: Record<string, number> })[];
}

async function seedVolume(): Promise<void> {
  const logger = new Logger('SeedVolume');

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

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
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
              new Logger(`SeedVolume ${index + 1}`),
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
        counts: counts.get(account.organizationId) ?? {},
      })),
    };

    mkdirSync(dirname(MANIFEST), { recursive: true });
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    const first = manifest.organizations[0].counts;

    logger.log(
      `Done in ${minutes} min. Each organization holds about ${first.orders} orders, ${first.lots} lots, ${first.invoices} invoices and ${first.stock_movements} stock movements.`,
    );
    logger.log(
      `Sign in as ${accounts[0].email} with password ${PASSWORD}. Manifest: ${MANIFEST}`,
    );
  } finally {
    await app.close();
  }
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
