import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { httpServer } from './utils/create-test-app';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

/**
 * A refused PDF opened from a link (ADR-071, amended for #526): Print and
 * Download PDF are plain links the browser follows itself, so a refusal
 * answers a page visit with a page it can read, and the app's own
 * requests with the JSON as before. What the page looks like is checked
 * by hand (MC-2513); these hold its status, its language, its escaping
 * and its links.
 */
describe('A refused document opened from a link (e2e)', () => {
  let app: INestApplication;
  /** Where every link on the page leads: the app. */
  let client: string;

  beforeAll(async () => {
    app = await createE2eApp();
    client = process.env.CLIENT_URL ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  const VISIT = { 'Sec-Fetch-Mode': 'navigate' };

  /** The page's links, as `label -> address`, in the order they stand. */
  function links(html: string): string[] {
    return [...html.matchAll(/<a[^>]* href="([^"]*)">([^<]*)<\/a>/g)].map(
      ([, href, label]) => `${label} -> ${href}`,
    );
  }

  function isPage(res: request.Response) {
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).not.toMatch(/<script/i);
    return res.text;
  }

  /**
   * A purchase whose one item has no name in Chinese, which the
   * organization requires and the supplier's documents print in: its
   * PDF is refused with item_name_missing. The item's code is typed with
   * markup in it, which the page must show as text.
   */
  async function unnamedPurchase() {
    const org = await registerOrganization(app, 'alpha');
    await org.agent
      .patch('/v1/organization')
      .send({ requiredNameLanguages: ['zh-Hans'] })
      .expect(204);
    const supplierId = await createPartner(org.agent, {
      name: 'Pacific Capsule Supply',
      code: 'PCS',
    });
    await org.agent
      .patch(`/v1/partners/${supplierId}`)
      .send({ documentLanguage: 'zh-Hans' })
      .expect(204);
    await createLocation(org.agent, { type: 'site', name: 'Main' });
    const { product } = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await org.agent
        .post('/v1/products')
        .send({ type: 'good', name: 'Scoop', variant: { sku: '<b>SC</b>-1' } })
        .expect(201),
    );
    const { order } = body<{ order: { id: string } }>(
      await org.agent
        .post('/v1/orders')
        .send({
          partnerId: supplierId,
          direction: 'purchase',
          lines: [
            {
              variantId: product.variants[0].id,
              quantityOrdered: '5',
              unitPrice: '4',
              currency: 'CAD',
            },
          ],
        })
        .expect(201),
    );
    return { org, orderId: order.id, productId: product.id };
  }

  it('answers a page visit with a page in the app’s language, its message escaped, with the item and the way back', async () => {
    const { org, orderId, productId } = await unnamedPurchase();

    const html = isPage(
      await org.agent
        .get(`/v1/orders/${orderId}/pdf?locale=zh-Hans`)
        .set(VISIT)
        .expect(409),
    );

    expect(html).toContain('<html lang="zh-Hans">');
    expect(html).toContain('<h1>无法生成此 PDF</h1>');
    expect(html).toContain(
      '<p class="message">Scoop（&lt;b&gt;SC&lt;/b&gt;-1）没有简体中文名称',
    );
    expect(html).not.toContain('<b>');
    expect(links(html)).toEqual([
      `打开物品 -> ${client}/items/${productId}`,
      `返回订单 -> ${client}/orders/${orderId}`,
    ]);
    // A refusal, not a failure: no reference to quote.
    expect(html).not.toContain('参考编号');
  });

  it('answers the same request without a visit’s headers with the JSON as before', async () => {
    const { org, orderId, productId } = await unnamedPurchase();

    // The app's own request, and one with no headers of a visit at all:
    // ?locale= is the page's alone, so the message is the request's
    // language, English here, as every refusal's.
    for (const headers of [{ 'Sec-Fetch-Mode': 'cors' }, {}]) {
      const res = await org.agent
        .get(`/v1/orders/${orderId}/pdf?locale=zh-Hans`)
        .set(headers)
        .expect(409);

      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      const refusal = body<Record<string, unknown>>(res);
      expect(Object.keys(refusal).sort()).toEqual([
        'code',
        'details',
        'error',
        'message',
        'path',
        'requestId',
        'statusCode',
        'timestamp',
      ]);
      expect(refusal).toMatchObject({
        statusCode: 409,
        error: 'CONFLICT',
        code: 'item_name_missing',
        details: { productId },
        path: `/v1/orders/${orderId}/pdf?locale=zh-Hans`,
      });
      expect(refusal.message).toMatch(
        /^Scoop \(<b>SC<\/b>-1\) has no 简体中文/,
      );
    }
  });

  it('counts an Accept preferring HTML as a visit only where no Sec-Fetch-Mode is sent', async () => {
    const { org, orderId } = await unnamedPurchase();
    const pdf = `/v1/orders/${orderId}/pdf`;
    const browser = 'text/html,application/xhtml+xml,*/*;q=0.8';

    isPage(await org.agent.get(pdf).set('Accept', 'text/html').expect(409));
    isPage(await org.agent.get(pdf).set('Accept', browser).expect(409));

    for (const headers of [
      { Accept: 'application/json' },
      { Accept: '*/*' },
      { Accept: browser, 'Sec-Fetch-Mode': 'cors' },
    ]) {
      const res = await org.agent.get(pdf).set(headers).expect(409);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
    }
  });

  it('reads Sign in when signed out, back to the document’s page, in the browser’s language without ?locale=', async () => {
    const orderId = randomUUID();
    const signedOut = request(httpServer(app));

    const html = isPage(
      await signedOut
        .get(`/v1/orders/${orderId}/pdf`)
        .set({ ...VISIT, 'Accept-Language': 'fr-CA,fr;q=0.9' })
        .expect(401),
    );

    expect(html).toContain('<html lang="fr-CA">');
    expect(html).toContain('<p class="message">Connexion requise</p>');
    expect(links(html)).toEqual([
      `Se connecter -> ${client}/orders/${orderId}`,
    ]);

    // A language the app does not speak is no language: the browser's.
    expect(
      isPage(
        await request(httpServer(app))
          .get(`/v1/orders/${orderId}/pdf?locale=de`)
          .set(VISIT)
          .expect(401),
      ),
    ).toContain('<html lang="en">');
  });

  // Every PDF route, its own document's page as the way back (R10).
  it('answers an unknown id with a 404 page back to its own document, on each of the six routes', async () => {
    const org = await registerOrganization(app, 'alpha');
    const routes = [
      ['/orders/:id/pdf', 'order'],
      ['/orders/:id/pro-forma', 'order'],
      [`/orders/:id/shipments/${randomUUID()}/pdf`, 'order'],
      ['/invoices/:id/pdf', 'invoice'],
      ['/credit-notes/:id/pdf', 'credit note'],
      ['/return-authorizations/:id/pdf', 'return authorization'],
    ];

    for (const [route, document] of routes) {
      const id = randomUUID();
      const page = route.split('/:id')[0];

      const html = isPage(
        await org.agent
          .get(`/v1${route.replace(':id', id)}`)
          .set(VISIT)
          .expect(404),
      );

      expect(links(html), route).toEqual([
        `Back to the ${document} -> ${client}${page}/${id}`,
      ]);
    }
  });

  it('titles a 404 with the app’s own words for the document', async () => {
    const org = await registerOrganization(app, 'alpha');

    const html = isPage(
      await org.agent
        .get(`/v1/invoices/${randomUUID()}/pdf`)
        .set(VISIT)
        .expect(404),
    );

    expect(html).toContain('<h1>This invoice doesn’t exist</h1>');
  });
});
