import { type APIRequestContext, test as base } from '@playwright/test';

import { OWNER_STATE_PATH } from './global-setup';
import {
  createApiContext,
  E2E_PASSWORD,
  registerOrganization,
  type SeededOrganization,
} from './support/api';

/**
 * Three fixtures, and the choice between them is the whole point:
 *
 * - `api`      — the shared owner from global-setup. Use this by default. The
 *                browser is already signed in as the same user, so anything
 *                seeded here is visible in the UI immediately.
 *
 * - `freshOrg` — a brand new organisation with its own owner. Use this when a
 *                test must not see the shared org's data: tenant isolation
 *                checks, empty-state screens, anything counting rows.
 *
 * - `viewerApi` — a Viewer inside the shared organisation, for the screens
 *                that hide controls behind a permission. Registration only
 *                ever creates an Owner, so a Viewer has to be invited by one.
 *
 * Reaching for `freshOrg` when `api` would do costs a registration (argon2 +
 * a multi-statement transaction) per test. Reaching for `api` when the test
 * counts rows produces a suite that passes alone and fails in parallel.
 */
interface Fixtures {
  api: APIRequestContext;
  freshOrg: SeededOrganization;
  viewerApi: APIRequestContext;
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

  viewerApi: async ({ api }, use) => {
    // Registration only ever creates an Owner, so a Viewer has to be invited
    // by one. That is also how it happens in reality.
    const email = `viewer-${Date.now().toString(36)}@example.test`;
    const roles = await api.get('/v1/roles');
    const viewer = (
      (await roles.json()) as { id: string; name: string }[]
    ).find((role) => role.name === 'Viewer');

    // A missing Viewer role means the organisation was not seeded, and the
    // non-null assertion below would report it as "cannot read properties of
    // undefined" three lines later.
    if (!viewer)
      throw new Error('No Viewer role — is the organisation seeded?');

    await api.post('/v1/users', {
      data: {
        email,
        name: 'E2E Viewer',
        password: E2E_PASSWORD,
        roleId: viewer!.id,
      },
    });

    const context = await createApiContext();
    await context.post('/v1/auth/login', {
      data: { email, password: E2E_PASSWORD },
    });

    await use(context);
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
