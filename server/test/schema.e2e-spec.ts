import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  ACCOUNT_EVENT_ACTIONS,
  DOCUMENT_TYPES,
  INVOICE_STATUSES,
  MOVEMENT_REASONS,
  ORDER_DIRECTIONS,
  ORDER_STATUSES,
} from '../src/database/schema';
import { createTestApp } from './utils/create-test-app';

/**
 * Invariants about the schema itself, not about any module's behaviour.
 *
 * What these have in common is that the code and the database hold the same
 * fact in two places, with nothing keeping them in step, and the drift is
 * silent in both directions.
 *
 * updated_at is maintained by a trigger, and drizzle-kit does not model
 * triggers: a new table needs a hand-written CREATE TRIGGER that nothing
 * generates and nothing warns about. Eight tables missed it between 0002 and
 * 0008, and the symptom — a timestamp that never moves — looks exactly like a
 * row nobody edited.
 *
 * A vocabulary is a TypeScript array and a check constraint. Adding to the
 * array without the migration produces an insert the database refuses, and
 * where the caller swallows that failure by design — as AccountEventService
 * does, so a login is never failed by its own logging — the result is a log
 * line nobody reads and an event that quietly does not exist. That is how
 * account.registered arrived.
 *
 * The Postgres-native fix for the first is an event trigger on
 * ddl_command_end, which needs superuser and is unavailable on a managed
 * host. A test runs everywhere the migrations do.
 */
describe('schema invariants', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives every table with updated_at a trigger to maintain it', async () => {
    const missing = await db.execute(sql`
      select c.relname
      from pg_class c
      where c.relkind = 'r'
        and exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'updated_at' and a.attnum > 0
        )
        and not exists (
          select 1 from pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal
        )
        order by c.relname`);

    // Named rather than counted: a failure should say which table to fix.
    expect(missing.rows.map((row) => row.relname)).toEqual([]);
  });

  /**
   * Every closed vocabulary the code owns, against the constraint that
   * enforces it.
   *
   * A table rather than four near-identical tests, because a fifth is a line
   * here and the rule is the same for all of them. The constraint names come
   * from the migrations; `\d <table>` in psql shows them if one is renamed.
   */
  describe.each([
    ['account_events_action_check', ACCOUNT_EVENT_ACTIONS],
    ['orders_status_check', ORDER_STATUSES],
    ['orders_direction_check', ORDER_DIRECTIONS],
    ['stock_movements_reason_check', MOVEMENT_REASONS],
    ['document_sequences_document_type_check', DOCUMENT_TYPES],
    ['invoices_status_check', INVOICE_STATUSES],
  ])('%s', (constraintName, values) => {
    it('accepts every value the code can write', async () => {
      const result = await db.execute(sql`
        select pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conname = ${constraintName}
      `);

      // A missing constraint is itself the failure: the vocabulary would be
      // unenforced rather than merely out of step, and a typo would reach the
      // column.
      expect(result.rows).toHaveLength(1);

      /**
       * String matching on the constraint definition, which is crude and
       * catches the thing that actually happens — a value added to the array
       * with no migration behind it. Parsing the expression properly would be
       * more machinery than the failure warrants.
       */
      const definition = String(result.rows[0].definition);
      const missing = values.filter(
        (value) => !definition.includes(`'${value}'`),
      );

      expect(missing).toEqual([]);
    });

    /**
     * The other direction, and the quieter one. A value the database still
     * accepts but the code has forgotten is dead vocabulary — it will not be
     * written again, and it makes the constraint lie about what the column
     * holds.
     */
    it('accepts nothing the code has forgotten', async () => {
      const result = await db.execute(sql`
        select pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conname = ${constraintName}
      `);

      const definition = String(result.rows[0].definition);

      // match returns RegExpMatchArray | null, and the empty fallback widens
      // to any[] without this.
      const quoted: string[] = definition.match(/'[^']+'/g) ?? [];

      const stale = quoted
        .map((token) => token.slice(1, -1))
        .filter((value) => !(values as readonly string[]).includes(value));

      expect(stale).toEqual([]);
    });
  });
});
