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
      message: this.messageFor(exception, isHttp),
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

  private messageFor(exception: unknown, isHttp: boolean): string | string[] {
    // Never surface an unexpected error's text: it leaks table names,
    // file paths, and driver internals to whoever triggered it.
    if (!isHttp) {
      return 'Internal server error';
    }

    const res = (exception as HttpException).getResponse();

    if (typeof res === 'string') return res;

    // ValidationPipe returns { message: string[], error, statusCode }
    const { message } = res as { message?: string | string[] };
    return message ?? (exception as HttpException).message;
  }
}
