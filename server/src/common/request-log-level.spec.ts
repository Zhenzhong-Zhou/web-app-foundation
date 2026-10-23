import type { IncomingMessage, ServerResponse } from 'node:http';

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

import { API_REVISION } from './api-revision';
import { ApiRevisionMiddleware } from './middleware/api-revision.middleware';
import { requestLogLevel } from './request-log-level';

/** A request as the middleware is given it. */
type Refusable = Parameters<ApiRevisionMiddleware['use']>[0];

/** A request sending `revision`, as the app's own client does. */
function sending(revision: string) {
  return {
    method: 'POST',
    originalUrl: '/v1/orders?draft=1',
    get: (name: string) =>
      name.toLowerCase() === 'x-api-revision' ? revision : undefined,
  } as unknown as Refusable;
}

/** The same request, as the request log is given it. */
const asLogged = (req: Refusable) => req as unknown as IncomingMessage;

const answered = (statusCode: number) =>
  ({ statusCode, setHeader: () => undefined }) as unknown as Response &
    ServerResponse;

describe('requestLogLevel', () => {
  it('writes a refusal at warn, a failure at error, the rest at info', () => {
    const req = sending(String(API_REVISION));
    expect(requestLogLevel(asLogged(req), answered(200))).toBe('info');
    expect(requestLogLevel(asLogged(req), answered(409))).toBe('warn');
    expect(requestLogLevel(asLogged(req), answered(503))).toBe('error');
    expect(
      requestLogLevel(asLogged(req), answered(200), new Error('broke')),
    ).toBe('error');
  });

  // ADR-081: logged once, at info, where it was refused.
  it('writes nothing for a request refused for its API revision', () => {
    // The middleware's own line, not under test here.
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const middleware = new ApiRevisionMiddleware();
    const req = sending(String(API_REVISION + 1));
    const res = answered(503);

    expect(() => middleware.use(req, res, () => undefined)).toThrow(
      ServiceUnavailableException,
    );
    expect(requestLogLevel(asLogged(req), res)).toBe('silent');
  });
});
