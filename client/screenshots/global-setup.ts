import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type APIRequestContext,
  type FullConfig,
  request,
} from '@playwright/test';

import {
  NO_ORGANIZATION_PATH,
  SESSION_PATH,
  type Targets,
  TARGETS_PATH,
} from './targets';

/** seed-demo.ts's fixed password, so only the email has to be given. */
const DEMO_PASSWORD = 'demo-password-2026';

/** The server's folder, where org:invite runs and its driver is installed. */
const SERVER = fileURLToPath(new URL('../../server/', import.meta.url));

/**
 * The pages a person outside the demo sees, by accounts kept in the dev
 * database once made, so a later run only signs in: one in no
 * organization, the inviter who let it join and leave, and the address an
 * organization invitation waits for.
 */
const OUTSIDERS = {
  alone: 'screenshots-no-organization@example.com',
  inviter: 'screenshots-inviter@example.com',
  /** One for each language, which its invitation's page speaks. */
  newOrganization: (language: string) =>
    `screenshots-new-organization-${language.toLowerCase()}@example.com`,
};

/** The pictures' languages, as capture.spec.ts takes them. */
const LANGUAGES = ['en', 'fr-CA', 'zh-Hans'];

interface KeysetPage<T> {
  entries: T[];
  nextCursor: string | null;
}

interface Referenced {
  id: string;
  reference: string | null;
}

interface InvoiceRow {
  id: string;
  orderId: string;
  status: string;
}

async function read<T>(api: APIRequestContext, path: string): Promise<T> {
  const response = await api.get(`/api/v1${path}`);

  if (!response.ok()) {
    throw new Error(
      `Reading ${path} failed: ${response.status()} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

/** A context of its own, as a browser that has not signed in. */
function freshContext(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL,
    // Stands in for the app, which sends it on every request (ADR-014).
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

/** A request that must succeed; on failure the server's reply says why. */
async function ok(
  doing: string,
  response: Awaited<ReturnType<APIRequestContext['post']>>,
): Promise<void> {
  if (!response.ok()) {
    throw new Error(
      `${doing} failed: ${response.status()} ${await response.text()}`,
    );
  }
}

/** Signed in as `email`, or false where it has no account yet. */
async function signedIn(
  api: APIRequestContext,
  email: string,
): Promise<boolean> {
  const response = await api.post('/api/v1/auth/login', {
    data: { email, password: DEMO_PASSWORD },
  });
  return response.ok();
}

/**
 * An account in no organization (ADR-078), following the browser's
 * language as the demo's does, so it is pictured in each.
 */
async function noOrganization(
  baseURL: string,
  databaseUrl: string,
): Promise<APIRequestContext> {
  const alone = await freshContext(baseURL);
  if (!(await signedIn(alone, OUTSIDERS.alone))) {
    await makeNoOrganization(alone, baseURL, databaseUrl);
  }
  await ok(
    'Following the browser’s language',
    await alone.patch('/api/v1/account/profile', { data: { locale: null } }),
  );
  return alone;
}

/**
 * The account in no organization, made as a person comes to be one:
 * invited by link, joined and left. Its inviter is an organization of its
 * own, registered for it, so the demo's bell hears of neither. The
 * inviter's address is confirmed in the database, as an invitation by link
 * asks (ADR-077), with the server's own driver.
 */
async function makeNoOrganization(
  alone: APIRequestContext,
  baseURL: string,
  databaseUrl: string,
): Promise<void> {
  const inviter = await freshContext(baseURL);
  try {
    if (!(await signedIn(inviter, OUTSIDERS.inviter))) {
      await ok(
        'Registering the inviter',
        await inviter.post('/api/v1/auth/register', {
          data: {
            email: OUTSIDERS.inviter,
            password: DEMO_PASSWORD,
            name: 'Maya Chen',
            organizationName: 'Lakeside Botanicals',
          },
        }),
      );
    }
    const { Client } = createRequire(`${SERVER}package.json`)('pg') as {
      Client: new (config: { connectionString: string }) => {
        connect(): Promise<unknown>;
        query(text: string, values: unknown[]): Promise<unknown>;
        end(): Promise<void>;
      };
    };
    const database = new Client({ connectionString: databaseUrl });
    await database.connect();
    try {
      await database.query(
        'update users set email_verified_at = now() where lower(email) = $1',
        [OUTSIDERS.inviter],
      );
    } finally {
      await database.end();
    }

    const roles = await read<{ id: string; name: string }[]>(inviter, '/roles');
    const viewer = roles.find((role) => role.name === 'Viewer');
    const invited = await inviter.post('/api/v1/invitations', {
      data: {
        email: OUTSIDERS.alone,
        roleIds: [viewer?.id],
        delivery: 'link',
      },
    });
    await ok('Inviting the account in no organization', invited);
    const { link } = (await invited.json()) as { link: string };

    await ok(
      'Joining',
      await alone.post('/api/v1/invitations/accept', {
        data: {
          token: new URL(link).searchParams.get('token'),
          name: 'Jordan Reid',
          password: DEMO_PASSWORD,
        },
      }),
    );
    await ok('Leaving', await alone.delete('/api/v1/account/membership'));
  } finally {
    await inviter.dispose();
  }
}

/**
 * An organization invitation's link in a language, as the operator makes
 * one with `npm run org:invite` (ADR-078), its question answered yes: made
 * again each run, replacing the one before, so it never runs out.
 */
function organizationInvitationPath(
  baseURL: string,
  databaseUrl: string,
  language: string,
): string {
  const run = spawnSync(
    'npm',
    [
      'run',
      '--silent',
      'org:invite',
      '--',
      '--email',
      OUTSIDERS.newOrganization(language),
      '--name',
      'Harbour Herbals',
      '--language',
      language,
    ],
    {
      cwd: SERVER,
      input: 'y\n',
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl, CLIENT_URL: baseURL },
    },
  );
  // The link, not the app's address printed above it.
  const link = /https?:\/\/\S+\/invitation\?\S+/.exec(run.stdout ?? '')?.[0];
  if (run.status !== 0 || !link) {
    throw new Error(`npm run org:invite failed: ${run.stderr || run.stdout}`);
  }
  const { pathname, search } = new URL(link);
  return `${pathname}${search}`;
}

/**
 * Runs once before any picture: signs in as the demo Owner, saves the
 * session for every browser to start from, and finds the records the detail
 * pages open.
 *
 * Through the client's own /api proxy, as the app's requests go, so the
 * cookie belongs to the host the pictures are taken on.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const email = process.env.DEMO_EMAIL?.trim();

  if (!email) {
    throw new Error(
      'Set DEMO_EMAIL to the account npm run seed:demo printed: ' +
        'DEMO_EMAIL=demo-…@example.com npm run screenshots',
    );
  }

  const baseURL = config.projects[0].use.baseURL!;
  // Checked by the config, which stops without it.
  const databaseUrl = process.env.DATABASE_URL!;
  const api = await freshContext(baseURL);

  try {
    const signIn = await api.post('/api/v1/auth/login', {
      data: {
        email,
        password: process.env.DEMO_PASSWORD ?? DEMO_PASSWORD,
      },
    });

    if (!signIn.ok()) {
      throw new Error(
        `Signing in as ${email} failed (${signIn.status()}). Is it the ` +
          'account seed:demo printed, in the database in ../.env?',
      );
    }

    // Small enough to read in one page each: the demo has a dozen orders.
    const orders = await read<KeysetPage<Referenced>>(
      api,
      '/orders?status=all&limit=100',
    );
    const invoices = await read<KeysetPage<InvoiceRow>>(
      api,
      '/invoices?limit=100',
    );
    const runs = await read<KeysetPage<Referenced>>(
      api,
      '/production-orders?limit=100',
    );
    const lots = await read<{ id: string; code: string }[]>(
      api,
      '/stock/lots/search?code=FOC-2609-01',
    );
    // Items' list is paged (ADR-092): the one product, found by its name.
    const products = await read<
      KeysetPage<{ id: string; displayName: string }>
    >(api, '/products?search=Calm%2090ct&discontinued=include');

    const orderId = (reference: string) =>
      orders.entries.find((order) => order.reference === reference)?.id;

    const invoiceOf = (reference: string, status: string) => {
      const order = orderId(reference);
      const found = invoices.entries.find(
        (invoice) => invoice.orderId === order && invoice.status === status,
      );
      return found?.id ?? null;
    };

    const run = runs.entries.find((each) => each.reference === 'CALM-RUN-01');
    const batch = lots.find((lot) => lot.code === 'FOC-2609-01');
    const calm = products.entries.find(
      (product) => product.displayName === 'Calm 90ct',
    );

    const targets: Targets = {
      saleOrderId: orderId('SO-DEMO-1') ?? null,
      issuedInvoiceId: invoiceOf('SO-DEMO-1', 'issued'),
      draftInvoiceId: invoiceOf('SO-DEMO-5', 'draft'),
      runInProgressId: run?.id ?? null,
      batchLotId: batch?.id ?? null,
      recipeProductId: calm?.id ?? null,
      organizationInvitationPaths: Object.fromEntries(
        LANGUAGES.map((language) => [
          language,
          organizationInvitationPath(baseURL, databaseUrl, language),
        ]),
      ),
    };

    if (!targets.saleOrderId) {
      throw new Error(
        `${email}'s organization has no SO-DEMO-1. Run npm run seed:demo ` +
          'in server/ and use the account it prints.',
      );
    }

    await mkdir(dirname(SESSION_PATH), { recursive: true });
    await writeFile(
      SESSION_PATH,
      JSON.stringify(await api.storageState(), null, 2),
    );
    await writeFile(TARGETS_PATH, JSON.stringify(targets, null, 2));

    const alone = await noOrganization(baseURL, databaseUrl);
    await writeFile(
      NO_ORGANIZATION_PATH,
      JSON.stringify(await alone.storageState(), null, 2),
    );
    await alone.dispose();
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
