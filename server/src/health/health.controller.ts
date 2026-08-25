import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';

/**
 * ADR-013: operational endpoints are excluded from API versioning.
 * A load balancer should not need to know the API version to run a probe.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    constructor(@Inject(DRIZZLE) private readonly db: Database) {}
    
    /** Liveness: is the process up? Deliberately checks no dependencies. */
    @Get()
    check() {
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    }
    
    /**
     * Readiness: can this instance actually serve traffic? Separate from
     * liveness on purpose — a database blip should stop traffic being routed
     * here, not cause the orchestrator to kill and restart a healthy process.
     */
    @Get('ready')
    async ready() {
        await this.db.execute(sql`select 1`);
        return { status: 'ready', database: 'up' };
    }
}