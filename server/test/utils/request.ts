import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';

import { httpServer } from './create-test-app';

/**
 * A supertest agent that carries the CSRF header on every request.
 *
 * CsrfGuard is global, so a bare supertest POST is now a 403 — and a 403 where
 * a test expected 201 reads as a broken feature rather than a missing header.
 * Setting it once here keeps that mistake out of every future auth test.
 *
 * The agent also persists cookies across requests, which is what makes
 * "log in, then call a protected route" work the way a browser does.
 */
export function authedAgent(app: INestApplication): TestAgent {
  const agent = request.agent(httpServer(app));
  agent.set('X-Requested-With', 'XMLHttpRequest');
  return agent;
}
