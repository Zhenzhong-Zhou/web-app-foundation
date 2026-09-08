import { test as base, type APIRequestContext } from '@playwright/test';

import { OWNER_STATE_PATH } from './global-setup';
import {
  createApiContext,
  registerOrganization,
  type SeededOrganization,
} from './support/api';

/**
 * Two fixtures, and the choice between them is the whole point:
 *
 * - `api`     — the shared owner from global-setup. Use this by default. The
 *               browser is already signed in as the same user, so anything
 *               seeded here is visible in the UI immediately.
 *
 * - `freshOrg` — a brand new organisation with its own owner. Use this when a
 *               test must not see the shared org's data: tenant isolation
 *               checks, empty-state screens, anything counting rows.
 *
 * Reaching for `freshOrg` when `api` would do costs a registration (argon2 +
 * a multi-statement transaction) per test. Reaching for `api` when the test
 * counts rows produces a suite that passes alone and fails in parallel.
 */
interface Fixtures {
  api: APIRequestContext;
  freshOrg: SeededOrganization;
}

export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    const context = await createApiContext(OWNER_STATE_PATH);
    await use(context);
    await context.dispose();
  },

  freshOrg: async ({}, use) => {
    const organization = await registerOrganization('tenant');
    await use(organization);
    await organization.api.dispose();
  },
});

export { expect } from '@playwright/test';
