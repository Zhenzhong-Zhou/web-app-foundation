import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from './database.module';
import { UNSAFE_GLOBAL_DB } from './database.tokens';
import { getTenantContext } from './tenant-context';

/**
 * Only tables carrying organization_id qualify. `users` has no such column by
 * design (ADR-004), so `tenantDb.select(users)` is a compile error rather than
 * a runtime surprise — the type system rejects the design mistake.
 */
export type TenantTable = PgTable & { organizationId: PgColumn };

/**
 * The one place the organization_id filter lives (ADR-003).
 *
 * Callers never write the filter, so they cannot forget it. There is no method
 * here that returns an unscoped query.
 */
@Injectable()
export class TenantDb {
  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

  private get organizationId(): string {
    const context = getTenantContext();

    if (!context) {
      // Loud by design. A tenant-scoped query with no tenant is a bug, and
      // returning everything would be a cross-tenant leak.
      throw new InternalServerErrorException(
        'No tenant context: this query ran outside a tenant-scoped request.',
      );
    }

    return context.organizationId;
  }

  private scope<T extends TenantTable>(table: T, where?: SQL): SQL {
    const tenant = eq(table.organizationId, this.organizationId);
    return where ? and(tenant, where)! : tenant;
  }

  select<T extends TenantTable>(
    table: T,
    where?: SQL,
  ): Promise<T['$inferSelect'][]> {
    // Drizzle's from() resolves a conditional type that TypeScript cannot
    // evaluate while T is still generic. The cast is confined to this file;
    // the return type restores what callers actually get.
    return this.db
      .select()
      .from(table as never)
      .where(this.scope(table, where));
  }

  insert<T extends TenantTable>(
    table: T,
    values: Omit<T['$inferInsert'], 'organizationId'>,
  ) {
    return this.db.insert(table).values({
      ...values,
      organizationId: this.organizationId,
    } as T['$inferInsert']);
  }

  update<T extends TenantTable>(
    table: T,
    values: Partial<Omit<T['$inferInsert'], 'organizationId' | 'id'>>,
    where?: SQL,
  ) {
    return this.db
      .update(table)
      .set(values as never)
      .where(this.scope(table, where));
  }

  delete<T extends TenantTable>(table: T, where?: SQL) {
    return this.db.delete(table).where(this.scope(table, where));
  }

  /**
   * Multi-statement work inside one transaction. The callback receives a raw
   * handle, so tenant scoping is the caller's responsibility here — use it only
   * where a single scoped call genuinely cannot express the work, such as the
   * registration transaction in ADR-004.
   */
  transaction<T>(
    fn: (
      tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    ) => Promise<T>,
  ) {
    return this.db.transaction(fn);
  }
}
