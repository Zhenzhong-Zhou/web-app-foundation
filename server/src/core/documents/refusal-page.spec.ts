import type { ErrorBody } from '../../common/filters/all-exceptions.filter';
import { type Refusal, refusalPage } from './refusal-page';

const APP = 'https://app.example.com';
const ORDER = '3f2c1d7e-0000-4000-8000-000000000001';
const ITEM = '3f2c1d7e-0000-4000-8000-000000000002';

function page(body: Partial<ErrorBody>, refusal: Partial<Refusal> = {}) {
  return refusalPage({
    body: {
      statusCode: 409,
      error: 'CONFLICT',
      message: 'Refused.',
      path: `/v1/orders/${ORDER}/pdf`,
      timestamp: '2026-11-10T19:00:00.000Z',
      requestId: 'req-1',
      ...body,
    },
    locale: 'en',
    page: '/orders/:id',
    back: `/orders/${ORDER}`,
    app: APP,
    ...refusal,
  });
}

/** The page's links, as `label -> address`, in the order they stand. */
function links(html: string): string[] {
  return [...html.matchAll(/<a[^>]* href="([^"]*)">([^<]*)<\/a>/g)].map(
    ([, href, label]) => `${label} -> ${href}`,
  );
}

describe('the refused document’s page (ADR-071, amended)', () => {
  // A code or a name is typed text, and the message quotes it.
  it('escapes the message, which can hold typed text', () => {
    const html = page({
      message:
        'Scoop (<b>SC</b>&"1\'<script>alert(1)</script>) has no 简体中文 name.',
    });

    expect(html).toContain(
      '<p class="message">Scoop (&lt;b&gt;SC&lt;/b&gt;&amp;&quot;1&#39;&lt;script&gt;alert(1)&lt;/script&gt;) has no 简体中文 name.</p>',
    );
    expect(html).not.toContain('<b>');
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes a link’s address', () => {
    const html = page({}, { back: '/orders/"><b>x</b>' });

    expect(html).toContain('href="https://app.example.com/orders/&quot;&gt;');
    expect(html).not.toContain('<b>');
  });

  it('links the item first where the name is missing, then back to the order', () => {
    const html = page({
      code: 'item_name_missing',
      details: { productId: ITEM },
    });

    expect(links(html)).toEqual([
      `Open the item -> ${APP}/items/${ITEM}`,
      `Back to the order -> ${APP}/orders/${ORDER}`,
    ]);
    expect(html).toContain(`<a class="main" href="${APP}/items/${ITEM}">`);
  });

  it('offers the way back alone for any other refusal', () => {
    expect(links(page({}))).toEqual([
      `Back to the order -> ${APP}/orders/${ORDER}`,
    ]);
  });

  it('reads Sign in after a 401, to the same page', () => {
    const html = page({ statusCode: 401, message: 'Authentication required' });

    expect(html).toContain('<h1>You’re signed out</h1>');
    expect(links(html)).toEqual([`Sign in -> ${APP}/orders/${ORDER}`]);
  });

  it('names the document a 404 is about, in the app’s words', () => {
    const html = page(
      { statusCode: 404 },
      { page: '/credit-notes/:id', back: `/credit-notes/${ORDER}` },
    );

    expect(html).toContain('<h1>This credit note doesn’t exist</h1>');
    expect(links(html)).toEqual([
      `Back to the credit note -> ${APP}/credit-notes/${ORDER}`,
    ]);
  });

  it('shows a failure’s reference, and says what to do rather than its message', () => {
    const html = page({
      statusCode: 500,
      message: 'An issued invoice is missing its address',
    });

    expect(html).toContain('<h1>Something went wrong</h1>');
    expect(html).not.toContain('missing its address');
    expect(html).toContain(
      '<p class="reference">Reference: <code>req-1</code></p>',
    );
  });

  it('shows no reference for a refusal', () => {
    expect(page({})).not.toContain('Reference');
  });

  it('is in the language asked for, its lang attribute too', () => {
    const html = page(
      { code: 'item_name_missing', details: { productId: ITEM } },
      { locale: 'zh-Hans' },
    );

    expect(html).toContain('<html lang="zh-Hans">');
    expect(html).toContain('<h1>无法生成此 PDF</h1>');
    expect(links(html)).toEqual([
      `打开物品 -> ${APP}/items/${ITEM}`,
      `返回订单 -> ${APP}/orders/${ORDER}`,
    ]);
  });

  it('holds no script, and one heading', () => {
    const html = page({ statusCode: 500 });

    expect(html).not.toMatch(/<script/i);
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });
});
