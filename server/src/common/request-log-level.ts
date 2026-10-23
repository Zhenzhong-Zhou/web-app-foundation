import type { IncomingMessage, ServerResponse } from 'node:http';

import type { LevelWithSilent } from 'pino';

import { ApiRevisionMiddleware } from './middleware/api-revision.middleware';

/**
 * The level the request log writes a request's line at (AppModule's
 * pinoHttp): a refusal at warn, a failure at error, the rest at info. A
 * request refused for the client's API revision writes none, since the
 * middleware that refused it has logged it once, at info and without a
 * stack (ADR-081); here a 409 would be a warning and a 503 an error.
 */
export function requestLogLevel(
  req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): LevelWithSilent {
  if (ApiRevisionMiddleware.refused(req)) return 'silent';
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}
