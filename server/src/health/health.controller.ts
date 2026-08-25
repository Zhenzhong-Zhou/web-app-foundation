import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

/**
 * ADR-013: operational endpoints are excluded from API versioning.
 * A load balancer should not need to know the API version to run a probe.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    @Get()
    check() {
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    }
}