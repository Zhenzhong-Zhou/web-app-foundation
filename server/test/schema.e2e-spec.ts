import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { createTestApp } from './utils/create-test-app';

/**
 * Invariants about the schema itself, not about any module's behaviour.
 *
 * This one exists because updated_at is maintained by a trigger and
 * drizzle-kit does not model triggers: a new table needs a hand-written
 * CREATE TRIGGER that nothing generates and nothing warns about. Eight tables
 * missed it between 0002 and 0008, and the symptom — a timestamp that never
 * moves — looks exactly like a row nobody edited.
 *
 * The Postgres-native fix is an event trigger on ddl_command_end, which needs
 * superuser and is therefore unavailable on a managed host. A test runs
 * everywhere the migrations do.
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
});
