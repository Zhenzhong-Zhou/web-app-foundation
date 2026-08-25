import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

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
