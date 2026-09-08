import { type APIRequestContext, request } from '@playwright/test';

/**
 * Setup goes through the API, never the UI.
 *
 * A test that needs a product in order to check the inventory table should not
 * spend twelve seconds driving the product form to get one — and should not
 * fail because someone renamed a button in a screen it isn't testing. Drive the
 * UI for the thing under test; seed everything else over HTTP.
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

/**
 * Meets the RegisterDto minimum of 12 characters. Not a secret — this only
 * ever reaches a local or CI database that gets dropped afterwards.
 */
export const E2E_PASSWORD = 'e2e-password-123';

export interface SeededOrganization {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  /**
   * Carries the `sid` cookie for this organisation's owner. Callers are
   * responsible for `dispose()` — the `freshOrg` fixture does it for you.
   */
  api: APIRequestContext;
}

export interface SeededProduct {
  id: string;
  name: string;
  sku: string;
}

/**
 * Collision-proof without a counter shared between workers: workers run in
 * separate processes, so a module-level integer would restart at zero in each.
 */
function unique(prefix: string): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${noise}`;
}

/**
 * The CSRF header is set here because these helpers stand in for a browser
 * that has already been trusted. It is deliberately not set on the browser
 * contexts in playwright.config.ts — the app has to prove it sends its own.
 */
export async function createApiContext(
  storageStatePath?: string,
): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    storageState: storageStatePath,
  });
}

/**
 * Registration both creates the organisation and returns a session, so this is
 * one round trip. There is no email-verification gate on protected routes, so
 * the returned context is immediately usable.
 */
export async function registerOrganization(
  label = 'e2e',
): Promise<SeededOrganization> {
  const api = await createApiContext();
  const slug = unique(label);

  const credentials = {
    email: `${slug}@example.test`,
    password: E2E_PASSWORD,
    name: 'E2E Owner',
    organizationName: `E2E Org ${slug}`,
  };

  const response = await api.post('/v1/auth/register', { data: credentials });

  if (!response.ok()) {
    throw new Error(
      `Registration failed: ${response.status()} ${await response.text()}`,
    );
  }

  return { ...credentials, api };
}

/**
 * Every product needs at least one variant (ADR-023) — the variant is what
 * carries the SKU and what stock actually sits against, so it is required at
 * creation rather than added afterwards.
 */
export async function createProduct(
  api: APIRequestContext,
  overrides: Partial<{ name: string; type: string; sku: string }> = {},
): Promise<SeededProduct> {
  const sku = overrides.sku ?? unique('SKU').toUpperCase();
  const name = overrides.name ?? `E2E Widget ${sku}`;

  const response = await api.post('/v1/products', {
    data: {
      type: overrides.type ?? 'good',
      name,
      variant: { sku },
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Product creation failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { product: { id: string } };

  return { id: body.product.id, name, sku };
}
