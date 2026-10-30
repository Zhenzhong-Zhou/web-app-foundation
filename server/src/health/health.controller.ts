import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Pool } from 'pg';

import { API_REVISION } from '../common/api-revision';
import { VERSION } from '../common/version';
import { Public } from '../core/auth/public.decorator';
import { PG_POOL } from '../database/database.module';
import type { Health, Readiness } from './dto/health-response.dto';

/**
 * ADR-013: operational endpoints are excluded from API versioning.
 * A load balancer should not need to know the API version to run a probe.
 */
// Orchestrator probes fire constantly; rate limiting them would make
// a healthy instance look dead.
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  // The pool, not TenantDb: a readiness probe has no tenant, and checking the
  // pool directly is what actually answers "can this instance serve traffic?"
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Liveness: is the process up? Deliberately checks no dependencies. */
  @Get()
  check(): Health {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      /**
       * Which build is answering. Render sets RENDER_GIT_COMMIT on every
       * deploy, so "is my fix live?" is a URL rather than a guess. Null
       * locally, where there is no deploy to name. Read from the environment
       * directly rather than the validated config: it is operational
       * metadata, and its absence is normal, not a misconfiguration.
       */
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      version: VERSION,
      apiRevision: API_REVISION,
    };
  }

  /**
   * Readiness: can this instance actually serve traffic? Separate from
   * liveness on purpose — a database blip should stop traffic being routed
   * here, not cause the orchestrator to kill and restart a healthy process.
   */
  @Get('ready')
  async ready(): Promise<Readiness> {
    await this.pool.query('select 1');
    return { status: 'ready', database: 'up' };
  }
}
