import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { ThrottlerStorage } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PERMISSIONS } from '../../src/core/authorization/permissions';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../../src/database/database.module';
import { permissions } from '../../src/database/schema';

/**
 * Boots the real application for an integration test.
 *
 * Uses configureApp() so the test exercises the same versioning, pipes, and
 * shutdown hooks as production — see src/bootstrap.ts.
 *
 * `customize` is the hook for overriding providers, e.g. stubbing the mailer
 * in step 5:
 *
 *   await createTestApp((b) =>
 *     b.overrideProvider(MailService).useValue(fakeMailer),
 *   );
 *
 * Callers must `await app.close()` in afterAll, or the pg pool stays open and
 * Jest hangs without explaining why.
 */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  const base = Test.createTestingModule({ imports: [AppModule] });
  const builder = customize ? customize(base) : base;

  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication());

  await app.init();
  return app;
}

/** getHttpServer() is typed `any`; cast in one place, not in every test. */
export function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/**
 * Inserts the permission catalogue if it is absent.
 *
 * Permissions ship with the code rather than being tenant data, and
 * provisionOrganization() throws when a key is missing — so a fresh
 * foundation_test cannot register anyone until these exist. resetDatabase()
 * excludes the table for the same reason.
 *
 * Idempotent, so it is safe to call from every suite's beforeAll.
 */
export async function seedPermissions(app: INestApplication): Promise<void> {
  const db = app.get<Database>(UNSAFE_GLOBAL_DB);

  await db
    .insert(permissions)
    .values(Object.values(PERMISSIONS).map((key) => ({ key })))
    .onConflictDoNothing();
}

/**
 * A ThrottlerStorage that never blocks.
 *
 * Suites that register or log in repeatedly hit the real limits and fail in a
 * way that looks like a bug in the thing under test. Rate limiting keeps its
 * own coverage in security.e2e-spec.ts, which uses the real storage.
 */
export const unlimitedThrottler: ThrottlerStorage = {
  increment: () =>
    Promise.resolve({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
};
