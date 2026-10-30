import * as Sentry from '@sentry/node';

import { runInTenantContext } from '../../database/tenant-context';
import { VERSION } from '../version';
import { flushFaults, reportFault, startTracker } from './tracker';

const DSN = 'https://publickey@o1.ingest.example.invalid/42';
const USER = '0193a7c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b';
const ORGANIZATION = '0193a7c4-0000-7e8f-9a0b-1c2d3e4f5a6b';

/** The events the tracker would have sent, recorded instead (ADR-084). */
let sent: Sentry.Event[];

const recording: Sentry.NodeOptions['transport'] = (options) =>
  Sentry.createTransport(options, (request) => {
    const lines = String(request.body).split('\n');
    for (let i = 1; i < lines.length; i += 2) {
      const item = JSON.parse(lines[i]) as { type: string };
      if (item.type === 'event') {
        sent.push(JSON.parse(lines[i + 1]) as Sentry.Event);
      }
    }
    return Promise.resolve({ statusCode: 200 });
  });

function start(settings: { ERROR_TRACKER_ENVIRONMENT?: string } = {}) {
  return startTracker(
    { ERROR_TRACKER_DSN: DSN, NODE_ENV: 'test', ...settings },
    recording,
  );
}

describe('the error tracker (ADR-084)', () => {
  const commit = process.env.RENDER_GIT_COMMIT;

  beforeEach(() => {
    sent = [];
    delete process.env.RENDER_GIT_COMMIT;
  });

  afterEach(async () => {
    await Sentry.close();
    Sentry.getCurrentScope().setClient(undefined);
    if (commit === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = commit;
  });

  it('starts nothing and sends nothing while unset', async () => {
    const line = startTracker({ NODE_ENV: 'production' }, recording);

    reportFault(new Error('lost'));
    await flushFaults();

    expect(line).toBe('Error tracker off: ERROR_TRACKER_DSN is unset');
    expect(Sentry.isInitialized()).toBe(false);
    expect(sent).toEqual([]);
  });

  it('says it is on, with its environment and release, never its address', () => {
    process.env.RENDER_GIT_COMMIT = 'abc123';

    const line = start({ ERROR_TRACKER_ENVIRONMENT: 'staging' });

    expect(line).toBe(
      `Error tracker on: environment staging, release ${VERSION}+abc123`,
    );
    expect(line).not.toContain('publickey');
    expect(line).not.toContain('ingest');
  });

  it('sends the release, the environment and the tags', async () => {
    start();

    reportFault(new Error('the disk is full'), {
      reference: 'req-1',
      route: '/v1/orders/:id',
    });
    await flushFaults();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      release: `${VERSION}+dev`,
      environment: 'test',
      tags: { side: 'server', reference: 'req-1', route: '/v1/orders/:id' },
      exception: { values: [{ type: 'Error', value: 'the disk is full' }] },
    });
  });

  it("names the user and the organization of an organization's request", async () => {
    start();

    runInTenantContext({ userId: USER, organizationId: ORGANIZATION }, () =>
      reportFault(new Error('inside')),
    );
    reportFault(new Error('outside'));
    await flushFaults();

    const [inside, outside] = sent;
    expect(inside).toMatchObject({
      user: { id: USER },
      tags: { organization: ORGANIZATION },
    });
    expect(outside.user).toBeUndefined();
    expect(outside.tags).not.toHaveProperty('organization');
  });

  // A caller can send its own X-Request-Id.
  it.each([
    ['other characters', 'wang.fang@example.com'],
    ['over 64', 'a'.repeat(65)],
  ])('sends no reference for a request id of %s', async (_case, reference) => {
    start();

    reportFault(new Error(`refused ${_case}`), { reference });
    await flushFaults();

    expect(sent[0].tags).not.toHaveProperty('reference');
  });
});
