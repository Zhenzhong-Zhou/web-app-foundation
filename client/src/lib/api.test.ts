import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/setup';
import { api, ApiError } from './api';

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
  });
});
