import { type APIRequestContext, type Page, request } from '@playwright/test';

/**
 * Setup goes through the API, never the UI.
 *
 * A test that needs a product in order to check the inventory table should not
 * spend twelve seconds driving the product form to get one — and should not
 * fail because someone renamed a button in a screen it isn't testing. Drive the
 * UI for the thing under test; seed everything else over HTTP.
 */

/**
 * Must match playwright.config.ts. These helpers call the API directly rather
 * than through the Vite proxy, so the port lives in two files — and pointing at
 * 3000 means talking to the dev server no matter what the config starts.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100';

// The helpers in e2e/support/api.ts read this too. Setting it here means the
// port is decided once — their default only applies if this config never ran.
process.env.E2E_API_URL ??= API_URL;

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
  /** What stock actually hangs off (ADR-023) — the product is a grouping. */
  variantId: string;
  name: string;
  sku: string;
}

export interface SeededPartner {
  id: string;
  name: string;
  code?: string;
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
  overrides: Partial<{
    name: string;
    type: string;
    sku: string;
    tracksLots: boolean;
  }> = {},
): Promise<SeededProduct> {
  const sku = overrides.sku ?? unique('SKU').toUpperCase();
  const name = overrides.name ?? `E2E Widget ${sku}`;

  const response = await api.post('/v1/products', {
    data: {
      type: overrides.type ?? 'good',
      name,
      variant: { sku, tracksLots: overrides.tracksLots ?? false },
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Product creation failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    product: { id: string; variants: { id: string }[] };
  };

  return {
    id: body.product.id,
    variantId: body.product.variants[0].id,
    name,
    sku,
  };
}

export interface SeededLocation {
  id: string;
  name: string;
}

/**
 * A top-level location, which is a leaf because nothing sits under it. Stock
 * lives only at leaves (ADR-024), and an operation with one room is the
 * simplest thing that satisfies that.
 *
 * Pass parentId to build a tree — the parent stops being a leaf as soon as it
 * has one, which is the invariant the locations screen renders.
 */
export async function createLocation(
  api: APIRequestContext,
  overrides: Partial<{ name: string; type: string; parentId: string }> = {},
): Promise<SeededLocation> {
  const name = overrides.name ?? unique('Shelf').toUpperCase();

  const response = await api.post('/v1/locations', {
    data: {
      type: overrides.type ?? 'site',
      name,
      parentId: overrides.parentId,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Location creation failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { location: { id: string } };
  return { id: body.location.id, name };
}

/**
 * Points the browser at a session other than the shared owner's.
 *
 * Cleared first: the page arrives with the owner's sid from storageState, and
 * adding a second cookie of the same name for the same host leaves it
 * unspecified which one the browser sends — a coin flip that would show up as
 * an unrelated test failing intermittently.
 */
export async function signInAs(page: Page, api: APIRequestContext) {
  await page.context().clearCookies();
  await page.context().addCookies((await api.storageState()).cookies);
}

/**
 * One table for suppliers and customers (ADR-026) — there is no role to pass,
 * because what a partner is follows from the orders raised against them.
 *
 * `code` is left undefined unless asked for: it is the only unique column on
 * the table, and a generated one in every seeded row would make the duplicate
 * test pass for the wrong reason.
 */
export async function createPartner(
  api: APIRequestContext,
  overrides: Partial<{ name: string; code: string; taxId: string }> = {},
): Promise<SeededPartner> {
  const name = overrides.name ?? unique('Partner').toUpperCase();

  const response = await api.post('/v1/partners', {
    data: { name, code: overrides.code, taxId: overrides.taxId },
  });

  if (!response.ok()) {
    throw new Error(
      `Partner creation failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { partner: { id: string } };
  return { id: body.partner.id, name, code: overrides.code };
}
