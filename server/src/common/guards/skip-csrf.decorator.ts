import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF = 'security:skipCsrf';

/**
 * Exempts a route from the CSRF header check.
 *
 * For endpoints called by something that is not our browser client — webhooks,
 * and later a bearer-token transport (ADR-011). Never for a cookie-authenticated
 * route: a browser can reach those, which is the entire attack.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
