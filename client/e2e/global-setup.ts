import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { registerOrganization } from './support/api';

export const OWNER_STATE_PATH = './e2e/.auth/owner.json';
export const OWNER_CREDENTIALS_PATH = './e2e/.auth/owner-credentials.json';

/**
 * Runs once before the whole suite.
 *
 * Signing in through the login form at the start of every test would add a few
 * seconds and a full argon2 verification to each one, and would couple every
 * spec in the suite to the login screen's markup. Instead: register once over
 * HTTP, save the resulting session cookie, and let `use.storageState` hand it
 * to every browser context.
 *
 * Sessions are opaque httpOnly cookies (ADR-011), which is precisely what
 * storageState persists — there is no token in localStorage to worry about.
 *
 * The cookie is written by the API on localhost:3000 but the app runs on
 * localhost:5173. That works: the cookie sets no Domain attribute, so it is
 * host-only, and cookie matching ignores the port.
 */
async function globalSetup(): Promise<void> {
  const organization = await registerOrganization('owner');

  const state = await organization.api.storageState();

  await mkdir(dirname(OWNER_STATE_PATH), { recursive: true });
  await writeFile(OWNER_STATE_PATH, JSON.stringify(state, null, 2));

  /**
   * Written separately so a spec can exercise the login *form* with an account
   * that is known to exist, without registering a second one.
   */
  await writeFile(
    OWNER_CREDENTIALS_PATH,
    JSON.stringify(
      {
        email: organization.email,
        password: organization.password,
        organizationName: organization.organizationName,
      },
      null,
      2,
    ),
  );

  await organization.api.dispose();
}

export default globalSetup;
