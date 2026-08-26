import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext, type RequestContext } from './request-context';

/**
 * Injects the resolved request context into a handler parameter.
 *
 * Throws rather than returning undefined: reaching a handler without context
 * means the route is @Public() and should not be asking who the user is. A
 * nullable return here would push that check into every controller.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const req = context.switchToHttp().getRequest<Request>();
    const requestContext = getRequestContext(req);

    if (!requestContext) {
      throw new InternalServerErrorException(
        '@CurrentUser() used on a route with no session — is it @Public()?',
      );
    }

    return requestContext;
  },
);
