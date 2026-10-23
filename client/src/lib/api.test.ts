import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { apiError } from '../test/handlers';
import { server } from '../test/setup';
import { OUTDATED, outdatedRefusal, serveVersion } from '../test/version';
import { BUILD } from '../version/build';
import { newVersionNow } from '../version/version-check';
import { api, ApiError, download, messageFor } from './api';

/** The error api() throws for a request, for asserting on its fields. */
async function failureOf(path: string): Promise<ApiError> {
  try {
    await api(path);
  } catch (caught) {
    if (caught instanceof ApiError) return caught;
    throw caught;
  }
  throw new Error('expected the request to fail');
}

describe('api', () => {
  /**
   * The throttler says how long to wait, and login and register show it. Until
   * this was read, both always said "try again later" to someone locked out
   * for a known number of seconds.
   */
  it('reads how long a 429 says to wait', async () => {
    server.use(
      http.get('/api/v1/things/limited', () =>
        HttpResponse.json(
          { message: 'ThrottlerException: Too Many Requests' },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );

    const error = await failureOf('/things/limited');

    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('leaves the wait unknown when a 429 does not say, or says a date', async () => {
    server.use(
      http.get('/api/v1/things/plain', () =>
        HttpResponse.json({ message: 'Slow down' }, { status: 429 }),
      ),
      http.get('/api/v1/things/dated', () =>
        HttpResponse.json(
          { message: 'Slow down' },
          {
            status: 429,
            headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
          },
        ),
      ),
    );

    expect(
      (await failureOf('/things/plain')).retryAfterSeconds,
    ).toBeUndefined();
    expect(
      (await failureOf('/things/dated')).retryAfterSeconds,
    ).toBeUndefined();
  });

  it('carries the server message and request id on any other failure', async () => {
    server.use(
      http.get('/api/v1/things/missing', () =>
        HttpResponse.json(
          {
            message: ['name should not be empty', 'code is too long'],
            requestId: 'req-1',
          },
          { status: 400, headers: { 'Retry-After': '5' } },
        ),
      ),
    );

    const error = await failureOf('/things/missing');

    expect(error.message).toBe('name should not be empty, code is too long');
    expect(error.requestId).toBe('req-1');
    // Only a 429 means "wait"; a stray header elsewhere is not read as one.
    expect(error.retryAfterSeconds).toBeUndefined();
    expect(error.code).toBeUndefined();
  });

  /**
   * A refusal a screen can offer a way out of comes with a code, which a
   * dialog keys on rather than on the message (ADR-061's link to Profile).
   */
  it('carries the refusal’s code beside its message', async () => {
    server.use(
      http.get('/api/v1/things/refused', () =>
        HttpResponse.json(
          {
            message: 'Set the address first',
            code: 'organization_address_missing',
          },
          { status: 409 },
        ),
      ),
    );

    const error = await failureOf('/things/refused');

    expect(error.message).toBe('Set the address first');
    expect(error.code).toBe('organization_address_missing');
  });
});

describe('the API revision (ADR-081)', () => {
  const INSTALLING =
    'A new version is being installed. Try again in a minute; nothing was saved.';

  /** The API, deployed with a revision above this tab's. */
  const refuseAsOutdated = () =>
    server.use(http.get('/api/v1/things/refused', () => outdatedRefusal()));

  afterEach(() => vi.restoreAllMocks());

  it('goes with every request, api() and download() alike', async () => {
    const sent: (string | null)[] = [];
    server.use(
      http.get('/api/v1/things', ({ request }) => {
        sent.push(request.headers.get('X-Api-Revision'));
        return HttpResponse.json([]);
      }),
      http.get('/api/v1/things/export', ({ request }) => {
        sent.push(request.headers.get('X-Api-Revision'));
        return new HttpResponse('Name\r\n', {
          headers: { 'Content-Disposition': 'attachment; filename="t.csv"' },
        });
      }),
    );
    // jsdom has no object URLs, and saves nothing.
    URL.createObjectURL = vi.fn(() => 'blob:export');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );

    await api('/things');
    await download('/things/export');
    expect(sent).toEqual([String(API_REVISION), String(API_REVISION)]);
  });

  it('notes an outdated refusal, and reads the version file, before the caller hears of it', async () => {
    serveVersion({ urgent: true });
    refuseAsOutdated();

    const error = await failureOf('/things/refused');
    expect(error.code).toBe('client_outdated');
    expect(newVersionNow()).toEqual({
      newer: true,
      urgent: true,
      outdated: true,
    });
    expect(messageFor(error)).toBe(OUTDATED);
  });

  it('says the new version is being installed while the file still names this build', async () => {
    refuseAsOutdated();

    const error = await failureOf('/things/refused');
    expect(newVersionNow()).toEqual({
      newer: false,
      urgent: false,
      outdated: true,
    });
    expect(messageFor(error)).toBe(INSTALLING);
  });

  it('lets the refusal through after five seconds when the version file does not answer', async () => {
    server.use(
      http.get('/version.json', async () => {
        await delay('infinite');
        return HttpResponse.json({ ...BUILD, apiRevision: API_REVISION });
      }),
    );
    refuseAsOutdated();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const refused = failureOf('/things/refused');
      await vi.advanceTimersByTimeAsync(5_000);
      const error = await refused;
      expect(error.code).toBe('client_outdated');
      expect(messageFor(error)).toBe(INSTALLING);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forgets the refusal once a request is served again, as after a rollback', async () => {
    refuseAsOutdated();
    await failureOf('/things/refused');

    await api('/products/variants');
    expect(newVersionNow().outdated).toBe(false);
  });

  it('keeps the server’s words for a 503, and notes nothing', async () => {
    server.use(
      http.get('/api/v1/things/refused', () =>
        apiError(503, INSTALLING, 'api_updating'),
      ),
    );

    const error = await failureOf('/things/refused');
    expect(messageFor(error)).toBe(INSTALLING);
    expect(newVersionNow().outdated).toBe(false);
  });
});
