import {
  type CallHandler,
  type ExecutionContext,
  mixin,
  type NestInterceptor,
  PayloadTooLargeException,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import type { Translatable } from '../../i18n/translate';
import { MB } from './file-kinds';

/**
 * One file from a form's `file` field, cut off by multer at `maxBytes`
 * while it arrives: past it nothing more is kept, the rest of the request
 * is thrown away as it comes, and the request is refused with 413
 * (ADR-059). Nest words that refusal "File too large", in English, with
 * no limit and no next step; here it is the route's own, given the limit
 * in MB, in the reader's language (#249).
 *
 * Only what multer refuses on the way in is reworded: the handler runs
 * once `super.intercept` has resolved, so its own refusals pass through
 * the observable untouched.
 */
export function receiveFile(
  maxBytes: number,
  tooLarge: (limit: number) => Translatable,
): Type<NestInterceptor> {
  const refusal = tooLarge(maxBytes / MB);

  class ReceiveFile extends FileInterceptor('file', {
    limits: { fileSize: maxBytes, files: 1 },
  }) {
    override async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      try {
        return await super.intercept(context, next);
      } catch (error) {
        if (error instanceof PayloadTooLargeException) {
          throw new PayloadTooLargeException(refusal);
        }
        throw error;
      }
    }
  }

  return mixin(ReceiveFile);
}
