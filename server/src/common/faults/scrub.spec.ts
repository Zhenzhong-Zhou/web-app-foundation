import type { Event } from '@sentry/node';

import { scrubEvent, scrubText } from './scrub';

const USER = '0193a7c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b';
const ORGANIZATION = '0193a7c4-0000-7e8f-9a0b-1c2d3e4f5a6b';

/** What each kind of personal detail looks like, going in. */
const PERSONAL = [
  'wang.fang@example.com',
  'Wang Fang',
  '88 Queen Street West',
  'search=Wang',
  'session=secret',
  '203.0.113.7',
  '2001:db8::7',
];

/** A report holding every kind ADR-084 never sends, in each place. */
function reportWithEverything(): Event {
  return {
    event_id: 'a'.repeat(32),
    timestamp: 1_800_000_000,
    platform: 'node',
    level: 'error',
    release: '0.7.0+abc123',
    environment: 'production',
    server_name: 'srv-wang-fang',
    message: 'Mail to wang.fang@example.com from 203.0.113.7 failed',
    exception: {
      values: [
        {
          type: 'DrizzleQueryError',
          value:
            'Failed query: insert into "partners" ("name", "address") values ($1, $2)\nparams: Wang Fang,88 Queen Street West',
          mechanism: {
            type: 'generic',
            handled: true,
            data: { who: 'Wang Fang' },
          },
          stacktrace: {
            frames: [
              {
                filename: '/app/dist/main.js?search=Wang',
                function: 'save',
                lineno: 10,
                colno: 5,
                in_app: true,
                vars: { name: 'Wang Fang' },
              },
            ],
          },
        },
        {
          type: 'error',
          value:
            'duplicate key value violates unique constraint "users_email_unique" Key (email)=(wang.fang@example.com) already exists.',
        },
        {
          type: 'error',
          value: 'invalid input syntax for type uuid: "Wang Fang"',
        },
      ],
    },
    tags: {
      side: 'server',
      reference: 'req-1',
      route: '/v1/partners/:id',
      organization: ORGANIZATION,
      customer: 'Wang Fang',
    },
    user: {
      id: USER,
      email: 'wang.fang@example.com',
      username: 'Wang Fang',
      ip_address: '203.0.113.7',
    },
    request: {
      url: 'https://app.example.com/partners?search=Wang',
      query_string: 'search=Wang',
      cookies: { session: 'secret' },
      data: { name: 'Wang Fang', address: '88 Queen Street West' },
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: 'session=secret',
        'X-Forwarded-For': '2001:db8::7',
      },
    },
    contexts: {
      os: { name: 'Linux', version: '6.1', kernel_version: 'Wang Fang' },
      customer: { name: 'Wang Fang', address: '88 Queen Street West' },
    },
    extra: { address: '88 Queen Street West' },
    breadcrumbs: [
      {
        category: 'navigation',
        data: { from: '/partners?search=Wang', to: '/partners/1' },
      },
      { category: 'console', message: 'Saved Wang Fang' },
      { category: 'ui.click', message: 'button "88 Queen Street West"' },
    ],
  };
}

describe('scrubEvent (ADR-084)', () => {
  it('lets no name, email, address, query, cookie or IP address through', () => {
    const sent = JSON.stringify(scrubEvent(reportWithEverything()));

    for (const detail of PERSONAL) expect(sent).not.toContain(detail);
    expect(sent).not.toContain('Wang');
  });

  it('keeps what a report carries', () => {
    const scrubbed = scrubEvent(reportWithEverything());

    expect(scrubbed).toMatchObject({
      release: '0.7.0+abc123',
      environment: 'production',
      tags: {
        side: 'server',
        reference: 'req-1',
        route: '/v1/partners/:id',
        organization: ORGANIZATION,
      },
      user: { id: USER },
      request: {
        url: 'https://app.example.com/partners',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
      contexts: { os: { name: 'Linux', version: '6.1' } },
      breadcrumbs: [
        {
          category: 'navigation',
          data: { from: '/partners', to: '/partners/1' },
        },
      ],
    });
    expect(scrubbed.exception?.values?.map(({ value }) => value)).toEqual([
      'Failed query: insert into "partners" ("name", "address") values ($1, $2)\nparams: [value]',
      'duplicate key value violates unique constraint "users_email_unique" Key (email)=([value]) already exists.',
      'invalid input syntax for type uuid: "[value]"',
    ]);
    expect(scrubbed.exception?.values?.[0].stacktrace?.frames).toEqual([
      {
        filename: '/app/dist/main.js',
        function: 'save',
        lineno: 10,
        colno: 5,
        in_app: true,
      },
    ]);
  });

  // A caller chooses its own X-Request-Id.
  it.each([
    ['other characters', 'Wang Fang'],
    ['over 64', 'a'.repeat(65)],
  ])('drops a reference of %s', (_case, reference) => {
    const scrubbed = scrubEvent({ tags: { side: 'server', reference } });

    expect(scrubbed.tags).toEqual({ side: 'server' });
  });
});

describe('scrubText', () => {
  it('keeps a time, a question and a quoted name of the schema', () => {
    const text =
      'At 05:10:00, why? null value in column "email" of relation "users"';

    expect(scrubText(text)).toBe(text);
  });

  it('takes out a full IPv6 address and an address shortened by ::', () => {
    expect(
      scrubText('from 2001:0db8:0000:0000:0000:ff00:0042:8329 and ::1'),
    ).toBe('from [ip] and [ip]');
  });
});
