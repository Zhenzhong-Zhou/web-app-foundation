import {
    Global,
    Inject,
    Module,
    OnApplicationShutdown,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import type { Env } from '../config/env';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

/** Inject this type, never the raw Pool. */
export type Database = NodePgDatabase<typeof schema>;

/**
 * Global so feature modules don't each import DatabaseModule. The pool is
 * created once at boot and shared — creating one per module would exhaust
 * Postgres connections.
 *
 * ADR-009: services must NOT inject DRIZZLE directly once the tenant-scoped
 * query helper lands in step 2. Direct access bypasses the organization_id
 * filter, which is the one bug that leaks data between tenants.
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
            provide: DRIZZLE,
            inject: [PG_POOL],
            useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
        },
    ],
    exports: [DRIZZLE, PG_POOL],
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