import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../config/env';
import { PG_POOL, UNSAFE_GLOBAL_DB } from './database.tokens';
import * as schema from './schema';
import { TenantDb } from './tenant-db.service';

// Re-exported so `from './database.module'` keeps working for both tokens.
export * from './database.tokens';

export type Database = NodePgDatabase<typeof schema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Global so feature modules don't each import DatabaseModule. The pool is
 * created once at boot and shared — creating one per module would exhaust
 * Postgres connections.
 *
 * Note what this module exports: `TenantDb` is what services inject.
 * `UNSAFE_GLOBAL_DB` and `PG_POOL` are exported for the narrow cases that are
 * legitimately tenant-less (auth, health probes, the ADR-012 retention pass)
 * and are restricted by lint rule everywhere else.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isTest = config.get('NODE_ENV', { infer: true }) === 'test';

        return new Pool({
          connectionString: isTest
            ? config.get('DATABASE_URL_TEST', { infer: true })
            : config.get('DATABASE_URL', { infer: true }),
          max: 10,
          idleTimeoutMillis: 30_000,
          // Fail fast rather than hanging forever on an unreachable database.
          connectionTimeoutMillis: 5_000,
        });
      },
    },
    {
      provide: UNSAFE_GLOBAL_DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    TenantDb,
  ],
  exports: [TenantDb, UNSAFE_GLOBAL_DB, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Requires app.enableShutdownHooks() in main.ts. Without this the pool keeps
   * its sockets open: Jest hangs after tests, and SIGTERM in production drops
   * in-flight queries instead of draining them.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Closing pg pool (${signal ?? 'shutdown'})`);
    await this.pool.end();
  }
}
