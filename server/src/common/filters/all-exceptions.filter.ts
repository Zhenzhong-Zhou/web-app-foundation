import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';

import { isTranslatable, localeOf, t, translate } from '../../i18n/translate';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * One error shape for the whole API. Clients parse a single contract instead of
 * guessing whether a failure came from a controller, a pipe, or an unhandled
 * throw somewhere in a service.
 *
 * @Catch() with no arguments catches everything, including non-Error values.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();

    const isHttp = exception instanceof HttpException;
    const status: HttpStatus = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
      message: this.messageFor(exception, isHttp, req),
      path: httpAdapter.getRequestUrl(req) as string,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    };

    // 5xx means a bug — log the full error with its stack. 4xx is the client
    // being told no, which is normal traffic and not worth an error log.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${body.path} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  /**
   * The message in the request's language (ADR-054). A service threw an id
   * with its English and values; it is rendered here in whatever the
   * request's Accept-Language asks for. No header, or one asking for
   * English, gets the English it was thrown with, word for word.
   */
  private messageFor(
    exception: unknown,
    isHttp: boolean,
    req: Request,
  ): string | string[] {
    const locale = localeOf(req.headers['accept-language']);

    // Never surface an unexpected error's text: it leaks table names,
    // file paths, and driver internals to whoever triggered it.
    if (!isHttp) {
      return translate(
        t({
          id: 'common.internalError',
          defaultMessage: 'Internal server error',
        }),
        locale,
      );
    }

    const res = (exception as HttpException).getResponse();

    if (typeof res === 'string') return res;
    if (isTranslatable(res)) return translate(res, locale);

    // Validation: one message per failed rule, each with its id.
    const { messages } = res as { messages?: unknown[] };
    if (Array.isArray(messages) && messages.every(isTranslatable)) {
      return messages.map((message) => translate(message, locale));
    }

    // ValidationPipe returns { message: string[], error, statusCode }
    const { message } = res as { message?: string | string[] };
    return message ?? (exception as HttpException).message;
  }
}
