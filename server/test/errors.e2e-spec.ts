import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type INestApplication, Logger } from '@nestjs/common';
import { parseEnvelope } from '@sentry/core';
import type { Event } from '@sentry/node';
import request from 'supertest';

import {
  TRACKER_PROJECT,
  type TrackerProject,
} from '../src/errors/errors.service';
import { createTestApp, httpServer } from './utils/create-test-app';
import { RecordingTracker } from './utils/recording-tracker';

/** What the browser's envelope names: a stand-in, never the project. */
const STAND_IN = 'https://public@errors.invalid/1';

/** One request the stub tracker received. */
interface Received {
  url: string;
  header: Record<string, unknown>;
  items: [Record<string, unknown>, unknown][];
}

/** An envelope as the browser's SDK sends it, one line a part. */
function envelope(...items: [object, object][]): string {
  return [
    {
      event_id: 'f'.repeat(32),
      sent_at: '2026-10-30T12:00:00Z',
      dsn: STAND_IN,
    },
    ...items.flat(),
  ]
    .map((part) => JSON.stringify(part))
    .join('\n');
}

function event(fields: Event = {}): [Record<string, unknown>, Event] {
  return [
    { type: 'event' },
    {
      event_id: 'f'.repeat(32),
      platform: 'javascript',
      level: 'error',
      exception: {
        values: [{ type: 'TypeError', value: 'x is undefined' }],
      },
      tags: { side: 'browser', reference: 'a1b2c3d4' },
      ...fields,
    },
  ];
}

const SESSION: [Record<string, unknown>, Record<string, unknown>] = [
  { type: 'session' },
  { sid: 'a'.repeat(32), status: 'exited', errors: 0 },
];

/**
 * The browser's error reports (ADR-084): `POST /errors` relays each event,
 * scrubbed, to the project the setting names, through a stub tracker here,
 * so nothing reaches a real one. 204 whatever the relay does.
 */
describe('Error reports (e2e)', () => {
  let stub: Server;
  let received: Received[];
  let answer: number;
  let app: INestApplication;
  let unset: INestApplication;

  function appWith(project: TrackerProject): Promise<INestApplication> {
    return createTestApp((builder) =>
      builder.overrideProvider(TRACKER_PROJECT).useValue(project),
    );
  }

  /** A report as the SDK's transport sends it: text, with the CSRF header. */
  function report(target: INestApplication, body: string | Buffer) {
    return request(httpServer(target))
      .post('/errors')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(body);
  }

  beforeAll(async () => {
    stub = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const [header, items] = parseEnvelope(Buffer.concat(chunks));
        received.push({ url: req.url ?? '', header, items });
        res.writeHead(answer).end();
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;

    app = await appWith({
      dsn: `http://projectkey@127.0.0.1:${port}/42`,
      environment: 'staging',
    });
    unset = await appWith({ dsn: undefined, environment: 'test' });
  });

  beforeEach(() => {
    received = [];
    answer = 200;
  });

  afterAll(async () => {
    await app.close();
    await unset.close();
    await new Promise((resolve) => stub.close(resolve));
  });

  it('relays the event to the project the setting names, and nothing else', async () => {
    await report(app, envelope(SESSION, event(), event())).expect(204);

    expect(received).toHaveLength(1);
    const [{ url, header, items }] = received;
    expect(url).toMatch(/^\/api\/42\/envelope\/\?.*sentry_key=projectkey/);
    expect(header.dsn).toBe(
      `http://projectkey@127.0.0.1:${(stub.address() as AddressInfo).port}/42`,
    );
    expect(items).toHaveLength(1);
    const [[item, payload]] = items;
    expect(item).toEqual({ type: 'event' });
    expect(payload).toMatchObject({
      event_id: 'f'.repeat(32),
      environment: 'staging',
      exception: { values: [{ type: 'TypeError', value: 'x is undefined' }] },
      tags: { side: 'browser', reference: 'a1b2c3d4' },
    });
  });

  it('relays nothing for an envelope with no event', async () => {
    await report(app, envelope(SESSION)).expect(204);
    expect(received).toEqual([]);
  });

  it('takes out every personal detail before relaying', async () => {
    await report(
      app,
      envelope(
        event({
          exception: {
            values: [
              {
                type: 'Error',
                value: 'No reply from ana@example.com at 203.0.113.7',
              },
            ],
          },
          user: {
            id: '0b6f2a8e-6a1e-4c7a-9f53-2f1f4c8f5e11',
            email: 'ana@example.com',
            username: 'Ana Lima',
            ip_address: '203.0.113.7',
            geo: { city: 'Montréal' },
          },
          request: {
            url: 'https://app.example.com/orders?q=Ana+Lima',
            cookies: { sid: 'secret' },
            headers: {
              'User-Agent': 'Firefox/140.0',
              Cookie: 'sid=secret',
              Referer: 'https://app.example.com/partners?q=12+Rue+Peel',
            },
            data: { name: 'Ana Lima', address: '12 Rue Peel' },
            query_string: 'q=Ana+Lima',
          },
          extra: { address: '12 Rue Peel, Montréal' },
          breadcrumbs: [
            { category: 'console', message: 'Ana Lima' },
            { category: 'ui.click', message: 'button "Ana Lima"' },
            {
              category: 'navigation',
              data: { from: '/orders?q=Ana', to: '/orders/1' },
            },
          ],
        }),
      ),
    ).expect(204);

    const sent = JSON.stringify(received[0].items);
    for (const personal of [
      'ana@example.com',
      '203.0.113.7',
      'Ana',
      'Lima',
      'Rue Peel',
      'Montréal',
      'secret',
      'q=',
    ]) {
      expect(sent).not.toContain(personal);
    }
    const [[, payload]] = received[0].items;
    expect(payload).toMatchObject({
      user: { id: '0b6f2a8e-6a1e-4c7a-9f53-2f1f4c8f5e11' },
      request: {
        url: 'https://app.example.com/orders',
        headers: { 'User-Agent': 'Firefox/140.0' },
      },
      breadcrumbs: [{ category: 'navigation', data: { to: '/orders/1' } }],
    });
  });

  it('refuses a report over 200 KB with 413, and relays nothing', async () => {
    const res = await report(app, 'x'.repeat(200 * 1024 + 1)).expect(413);
    expect((res.body as { message: string }).message).toBe(
      'An error report can be at most 200 KB. Send a shorter one.',
    );
    // As it arrives, when no length is declared.
    const streamed = request(httpServer(app))
      .post('/errors')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'text/plain;charset=UTF-8');
    for (let i = 0; i < 21; i += 1) streamed.write('x'.repeat(10 * 1024));
    await streamed.expect(413);
    expect(received).toEqual([]);
  });

  it('refuses with 400 what is not an envelope', async () => {
    for (const body of [
      '',
      'hello',
      '"a string"',
      `${JSON.stringify({ dsn: STAND_IN })}\n["not an item header"]\n{}`,
      `${JSON.stringify({ dsn: STAND_IN })}\n{"type":"event"}\n"not an event"`,
      // An event whose fields have the wrong types.
      envelope([{ type: 'event' }, { exception: { values: 'none' } }]),
      envelope([{ type: 'event' }, { message: 42 }]),
    ]) {
      await report(app, body).expect(400);
    }
    // JSON, which the app's own parser reads first.
    await request(httpServer(app))
      .post('/errors')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ event_id: 'f'.repeat(32) })
      .expect(400);
    expect(received).toEqual([]);
  });

  it('refuses a report without X-Requested-With', async () => {
    await request(httpServer(app))
      .post('/errors')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(envelope(event()))
      .expect(403);
    expect(received).toEqual([]);
  });

  it('answers a report without the client’s API revision', async () => {
    await report(app, envelope(event())).expect(204);
    expect(received).toHaveLength(1);
  });

  it('is version-neutral, as /health is', async () => {
    await request(httpServer(app))
      .post('/v1/errors')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(envelope(event()))
      .expect(404);
  });

  it('sends nothing while the setting is unset, and still answers 204', async () => {
    await report(unset, envelope(event())).expect(204);
    expect(received).toEqual([]);
  });

  it('answers 204 when the relay fails, logging a warning and reporting nothing', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const tracker = new RecordingTracker();
    tracker.start();
    try {
      answer = 503;
      await report(app, envelope(event())).expect(204);

      expect(received).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        { status: 503 },
        'A browser’s error report was not relayed',
      );
      expect(await tracker.sent()).toEqual([]);
    } finally {
      await tracker.stop();
      warn.mockRestore();
    }
  });
});
