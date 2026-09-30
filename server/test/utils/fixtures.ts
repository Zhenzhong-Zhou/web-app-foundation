import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import { MailService } from '../../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './create-test-app';
import { RecordingMailService } from './recording-mail';
import { authedAgent } from './request';

/**
 * The password every spec's Owner signs up with. Long enough for the policy,
 * and one value, so a spec that signs in again does not have to find it.
 */
export const PASSWORD = 'correct-horse-battery';

/** A response body as the shape the test expects; supertest types it any. */
export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

/**
 * The app a feature spec runs against, with permissions seeded.
 *
 * Throttling is off because every test registers, and registration is
 * limited to five a minute; the limit keeps its own coverage in
 * security.e2e-spec.ts. Mail is recorded rather than sent — pass the
 * recorder in when the spec reads what was sent.
 */
export async function createE2eApp(
  mail: RecordingMailService = new RecordingMailService(),
): Promise<INestApplication> {
  const app = await createTestApp((builder) =>
    builder
      .overrideProvider(ThrottlerStorage)
      .useValue(unlimitedThrottler)
      .overrideProvider(MailService)
      .useValue(mail),
  );

  await seedPermissions(app);

  return app;
}

interface Registered {
  user: { id: string; organizationId: string };
}

/**
 * A new organization with its Owner signed in on the returned agent.
 *
 * `slugish` names both, as every spec already did: owner@alpha.example.com
 * of "alpha Co". Tests assert on that email, so the pattern is part of the
 * contract rather than a detail.
 */
export async function registerOrganization(
  app: INestApplication,
  slugish: string,
  options: { userAgent?: string } = {},
) {
  const agent = authedAgent(app);
  const email = `owner@${slugish}.example.com`;

  let request = agent.post('/v1/auth/register');
  if (options.userAgent) request = request.set('User-Agent', options.userAgent);

  const res = await request
    .send({
      email,
      password: PASSWORD,
      name: 'Owner',
      organizationName: `${slugish} Co`,
    })
    .expect(201);

  const { user } = body<Registered>(res);

  return { agent, email, userId: user.id, organizationId: user.organizationId };
}
