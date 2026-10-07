import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  type APIRequestContext,
  type FullConfig,
  request,
} from '@playwright/test';

import { SESSION_PATH, type Targets, TARGETS_PATH } from './targets';

/** seed-demo.ts's fixed password, so only the email has to be given. */
const DEMO_PASSWORD = 'demo-password-2026';

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

  const api = await request.newContext({
    baseURL: config.projects[0].use.baseURL,
    // Stands in for the app, which sends it on every request (ADR-014).
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  });

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
    const products = await read<{ id: string; name: string }[]>(
      api,
      '/products',
    );

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
    const calm = products.find((product) => product.name === 'Calm 90ct');

    const targets: Targets = {
      saleOrderId: orderId('SO-DEMO-1') ?? null,
      issuedInvoiceId: invoiceOf('SO-DEMO-1', 'issued'),
      draftInvoiceId: invoiceOf('SO-DEMO-5', 'draft'),
      bilingualInvoiceId: invoiceOf('SO-DEMO-QC', 'issued'),
      runInProgressId: run?.id ?? null,
      batchLotId: batch?.id ?? null,
      recipeProductId: calm?.id ?? null,
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
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
