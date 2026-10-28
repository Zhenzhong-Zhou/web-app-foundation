import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * The request's Accept-Language header, for localeOf (ADR-054), documented
 * as the server reads it: optional, none being English. Nest documents a
 * @Headers parameter as required, which no tab is refused for and oasdiff
 * calls breaking wherever an operation gains one (ADR-081).
 */
export const AcceptLanguage = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().headers['accept-language'],
  [
    // An operation's parameters are documented on its method, so the
    // method's descriptor rather than this parameter's index.
    (target, key) =>
      ApiHeader({ name: 'accept-language', required: false })(
        target,
        key!,
        Object.getOwnPropertyDescriptor(target, key!)!,
      ),
  ],
);
