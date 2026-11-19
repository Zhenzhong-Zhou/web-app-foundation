import { readFileSync } from 'node:fs';

import { type APIRequestContext, expect } from '@playwright/test';

import {
  created,
  createLocation,
  createPartner,
  createProduct,
  daysFromNow,
} from './api';

/**
 * Every signed-in page, for the tests that walk them all: Help beside each
 * (help.spec) and the frame each sits in (page-frame.spec). From the
 * router's own list, so a page added later is walked too.
 */

/** A route of the router's list, and where a test opens it. */
export interface PageToOpen {
  /** As the router matches it: `/orders/:id`. */
  path: string;
  /**
   * Its address, a record's own for a route that opens one; none where
   * no record is seeded for it yet, which the test reports.
   */
  url?: string;
  /** Named narrower in its route: Home, or a page that is one form. */
  narrower: boolean;
}

/**
 * Every signed-in page and its address, in the organization `api` is the
 * Owner of: one of its own, as the records are seeded there.
 */
export async function everyPage(api: APIRequestContext): Promise<PageToOpen[]> {
  const ids = await seedEveryPage(api);
  const urls: Record<string, string> = {
    '/people/:userId': `/people/${ids.userId}`,
    '/settings/price-lists/:id': `/settings/price-lists/${ids.priceListId}`,
    '/items/:id': `/items/${ids.productId}`,
    '/lots/:id': `/lots/${ids.lotId}`,
    '/partners/:id': `/partners/${ids.partnerId}`,
    '/orders/:id': `/orders/${ids.orderId}`,
    '/invoices/:id': `/invoices/${ids.invoiceId}`,
    '/credit-notes/:id': `/credit-notes/${ids.creditNoteId}`,
    '/return-authorizations/:id': `/return-authorizations/${ids.rmaId}`,
    '/production/:id': `/production/${ids.runId}`,
    '/settings/roles/:id': `/settings/roles/${ids.roleId}`,
    '/settings/roles/:id/edit': `/settings/roles/${ids.roleId}/edit`,
  };
  return signedInRoutes().map(({ path, narrower }) => ({
    path,
    url: path.includes(':') ? urls[path] : path,
    narrower,
  }));
}

/**
 * The router's own list, SIGNED_IN_ROUTES in src/routes.ts, read from its
 * source: importing it here would bring every page, which this project
 * does not compile. Every entry read, or none: one written another way
 * would be left out of every walk unseen.
 */
function signedInRoutes(): { path: string; narrower: boolean }[] {
  const source = readFileSync(
    new URL('../../src/routes.ts', import.meta.url),
    'utf8',
  );
  const list = source.slice(source.indexOf('SIGNED_IN_ROUTES'));
  const routes = [
    ...list.matchAll(/\{ path: '([^']+)', page: \w+(, narrower: true)? \}/g),
  ].map(([, path, narrower]) => ({ path, narrower: !!narrower }));
  const entries = list.match(/\{ path: /g)?.length ?? 0;
  if (routes.length < 30 || routes.length !== entries) {
    throw new Error(
      `SIGNED_IN_ROUTES not read: ${routes.length} of ${entries} entries`,
    );
  }
  return routes;
}

/**
 * A record for each page that opens one: an order, invoiced, issued,
 * credited and returned; a lot; a run; a price list; and the Owner on People.
 */
async function seedEveryPage(api: APIRequestContext) {
  const { user } = await created<{ user: { id: string } }>(
    await api.get('/v1/auth/me'),
  );
  const product = await createProduct(api, { tracksLots: true });
  const location = await createLocation(api);
  const partner = await createPartner(api);
  // What issuing an invoice asks for: where the seller is, and where the
  // customer is billed.
  for (const response of [
    await api.put('/v1/organization/address', {
      data: { line1: '100 Main St', city: 'Vancouver', country: 'CA' },
    }),
    await api.post(`/v1/partners/${partner.id}/addresses`, {
      data: {
        line1: '9 Harbour Rd',
        country: 'CA',
        isBilling: true,
        isShipping: true,
      },
    }),
  ]) {
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  const { movement } = await created<{ movement: { lotId: string } }>(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '24',
        reason: 'receipt',
        lot: { code: 'BESIDE-1', expiresAt: daysFromNow(200) },
      },
    }),
  );

  const { order } = await created<{
    order: { id: string; lines: { id: string }[] };
  }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: '10',
            unitPrice: '12.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  const confirmed = await api.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  const { taxCode } = await created<{ taxCode: { id: string } }>(
    await api.post('/v1/tax-codes', {
      data: { name: 'Exempt', components: [] },
    }),
  );
  const { shipment } = await created<{ shipment: { id: string } }>(
    await api.post(`/v1/orders/${order.id}/shipments`, {
      data: {
        fromLocationId: location.id,
        lines: [{ lineId: order.lines[0].id, quantity: '6' }],
      },
    }),
  );
  const { invoice } = await created<{
    invoice: { id: string; lines: { id: string; orderLineId: string }[] };
  }>(
    await api.post('/v1/invoices', {
      data: { shipmentId: shipment.id, taxCodeId: taxCode.id },
    }),
  );
  await created(
    await api.post(`/v1/invoices/${invoice.id}/issue`, {
      data: { invoiceDate: daysFromNow(0) },
    }),
  );
  const { creditNote } = await created<{ creditNote: { id: string } }>(
    await api.post(`/v1/invoices/${invoice.id}/credit-notes`, {
      data: {
        lines: [{ invoiceLineId: invoice.lines[0].id, quantity: '1' }],
        reason: 'One arrived cracked',
        creditDate: daysFromNow(0),
      },
    }),
  );
  const { returnAuthorization } = await created<{
    returnAuthorization: { id: string };
  }>(
    await api.post('/v1/return-authorizations', {
      data: {
        orderId: order.id,
        invoiceId: invoice.id,
        reason: 'Cracked in transit',
        expectsGoods: false,
        lines: [
          {
            lineId: invoice.lines[0].orderLineId,
            quantity: '1',
            resolution: 'credit',
          },
        ],
      },
    }),
  );

  const { productionOrder } = await created<{
    productionOrder: { id: string };
  }>(
    await api.post('/v1/production-orders', {
      data: {
        outputVariantId: product.variantId,
        locationId: location.id,
        quantityPlanned: '50',
        reference: 'BESIDE-RUN',
      },
    }),
  );
  const { priceList } = await created<{ priceList: { id: string } }>(
    await api.post('/v1/price-lists', {
      data: { name: 'Retail', direction: 'sale', currency: 'CAD' },
    }),
  );

  // A role made here, which its page and the editor open (ADR-080).
  const role = await created<{ id: string }>(
    await api.post('/v1/roles', {
      data: { name: 'Dock crew', permissions: ['stock.view'] },
    }),
  );

  return {
    roleId: role.id,
    userId: user.id,
    productId: product.id,
    lotId: movement.lotId,
    partnerId: partner.id,
    orderId: order.id,
    invoiceId: invoice.id,
    creditNoteId: creditNote.id,
    rmaId: returnAuthorization.id,
    runId: productionOrder.id,
    priceListId: priceList.id,
  };
}
