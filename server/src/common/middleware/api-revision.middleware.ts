import {
  ConflictException,
  Injectable,
  Logger,
  type NestMiddleware,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { t } from '../../i18n/translate';
import { API_REVISION } from '../api-revision';
import { ERROR_CODES, withCode } from '../error-codes';

/** The requests refused here, whose one log line is this middleware's. */
const refused = new WeakSet<object>();

/**
 * Compares the API revision the app's own client sends with the server's
 * (ADR-081). First for every request, before the session is read or the
 * body validated, so an outdated tab is told why whatever it sent, and
 * nothing it sent is read. A body that is not JSON at all is refused by the
 * body parser before this, as it always was.
 *
 * No header, or anything but a positive whole number, is served as today:
 * a test, a script, a PDF or export link, one day an integration.
 */
@Injectable()
export class ApiRevisionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiRevisionMiddleware.name);

  /**
   * Whether this request was refused here. The request log would write the
   * 409 at warn and the 503 at error, and the exception filter the 503 with
   * a stack; both leave it to the one line written here, at info.
   */
  static refused(req: object): boolean {
    return refused.has(req);
  }

  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const sent = revisionOf(req.get('X-Api-Revision'));
    if (sent === null || sent === API_REVISION) return next();

    refused.add(req);
    const outdated = sent < API_REVISION;
    // So that after a deploy the log says how many open tabs it met, and on
    // which routes: the path without its query.
    this.logger.log(
      {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        clientRevision: sent,
        serverRevision: API_REVISION,
        requestId: req.id,
      },
      outdated
        ? 'Refused an outdated client'
        : 'Refused a client newer than the API',
    );

    if (outdated) {
      throw new ConflictException(
        withCode(
          t({
            id: 'common.clientOutdated',
            defaultMessage:
              'This tab is running an older version of the app, so nothing was saved. Copy anything you typed, then reload.',
          }),
          ERROR_CODES.clientOutdated,
        ),
      );
    }

    // A client newer than the API meets an API not deployed yet, or rolled
    // back: minutes, the time a deploy takes to finish.
    res.setHeader('Retry-After', '60');
    throw new ServiceUnavailableException(
      withCode(
        t({
          id: 'common.apiUpdating',
          defaultMessage:
            'A new version is being installed. Try again in a minute; nothing was saved.',
        }),
        ERROR_CODES.apiUpdating,
      ),
    );
  }
}

/** The header's revision, or null for anything but a positive whole number. */
function revisionOf(header: string | undefined): number | null {
  if (header === undefined || !/^\d+$/.test(header)) return null;
  const revision = Number(header);
  return revision > 0 ? revision : null;
}
