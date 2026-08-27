import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database, Transaction } from './database.module';
import { UNSAFE_GLOBAL_DB } from './database.tokens';
import { getTenantContext } from './tenant-context';

/**
 * Only tables carrying organization_id qualify. `users` has no such column by
 * design (ADR-004), so `tenantDb.select(users)` is a compile error rather than
 * a runtime surprise — the type system rejects the design mistake.
 */
export type TenantTable = PgTable & { organizationId: PgColumn };

/** A projection: output key -> column, from either side of the join. */
type JoinedColumns = Record<string, PgColumn>;

/**
 * The row shape a projection produces.
 *
 * Reconstructed by hand because Drizzle's own inference cannot resolve through
 * a generic boundary — it derives result keys from the table's *literal* name
 * type, which is still unresolved while J is generic. Naming columns
 * explicitly avoids that entirely, and is the better interface regardless: a
 * whole-table join is how password_hash escapes through a list endpoint.
 */
type JoinedRow<C extends JoinedColumns> = {
  [K in keyof C]: C[K]['_']['notNull'] extends true
    ? C[K]['_']['data']
    : C[K]['_']['data'] | null;
};

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

  /**
   * A join driven by a tenant-scoped table.
   *
   * `table` must carry organization_id; `join` need not. Reachability through
   * a scoped row is what makes the joined side safe — memberships proves the
   * organization, and users hangs off it. That is the same argument the
   * permission guard makes for role_permissions.
   *
   * This exists so that "list the users in this organization" is one scoped
   * query rather than two. The two-query alternative — scoped ids, then a
   * global `where id in (...)` — moves the tenant filter into the caller,
   * where it is one refactor away from being dropped. ADR-003 puts the filter
   * in one place precisely so that cannot happen.
   *
   * innerJoin only. leftJoin would type the joined side as non-null when it
   * can be null, since JoinedRow reads each column's own nullability rather
   * than the join's. Add it when something needs it, with the nullability
   * handled honestly.
   *
   * Guarantees the organization_id predicate, nothing more: a wrong `on`
   * compiles and returns wrong rows. That is a correctness bug, not a tenant
   * leak.
   */
  selectJoined<T extends TenantTable, C extends JoinedColumns>(
    table: T,
    join: PgTable,
    on: SQL,
    columns: C,
    where?: SQL,
  ): Promise<JoinedRow<C>[]> {
    // Drizzle's builder is guarded by conditional types that TypeScript cannot
    // evaluate while T is still generic — `.from()` rejects T even though the
    // branch it resolves to *is* T. Casting the arguments does not help: `never`
    // then propagates into the builder's type parameters and `.where()`
    // disappears one hop later. So the escape is on the receiver, once, and the
    // declared return type restores what callers actually get.
    const db = this.db as unknown as {
      select: (columns: C) => {
        from: (table: PgTable) => {
          innerJoin: (
            table: PgTable,
            on: SQL,
          ) => { where: (where: SQL) => Promise<JoinedRow<C>[]> };
        };
      };
    };

    return db
      .select(columns)
      .from(table)
      .innerJoin(join, on)
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
   * Multi-statement work in one transaction, with the tenant available.
   *
   * The callback receives the raw handle *and* the current organization id, so
   * a write to a global table (users) and a write to a scoped one (memberships)
   * can be atomic without the caller reaching for UNSAFE_GLOBAL_DB. The
   * organization comes from tenant context rather than from the caller, which
   * is what keeps the lint exemption closed at core/auth and core/authorization.
   *
   * Scoping inside the callback is the caller's responsibility — that is the
   * cost of a raw handle, and why this is not the default way to query.
   */
  transaction<T>(
    fn: (tx: Transaction, organizationId: string) => Promise<T>,
  ): Promise<T> {
    // Read before opening the transaction: the getter throws when there is no
    // context, and failing before BEGIN is cleaner than failing inside it.
    const organizationId = this.organizationId;
    return this.db.transaction((tx) => fn(tx, organizationId));
  }
}
