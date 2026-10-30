import type { Server } from 'node:http';

import {
  ConflictException,
  Controller,
  Get,
  type INestApplication,
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { MockInstance } from 'vitest';

import { API_REVISION } from '../api-revision';
import { reportFault } from '../faults/tracker';
import { ApiRevisionMiddleware } from '../middleware/api-revision.middleware';
import { AllExceptionsFilter } from './all-exceptions.filter';

vi.mock('../faults/tracker', () => ({ reportFault: vi.fn() }));

@Controller('orders')
class Orders {
  @Get()
  list(): never {
    throw new Error('connection reset');
  }

  @Get('taken')
  taken(): never {
    throw new ConflictException('That number is taken.');
  }
}

/** The request id pino-http gives every request, and ADR-081's check. */
@Module({
  controllers: [Orders],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
class Probe implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        (
          req: Request & { id?: string },
          _res: Response,
          next: NextFunction,
        ) => {
          req.id = 'req-1';
          next();
        },
        ApiRevisionMiddleware,
      )
      .forRoutes('*');
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;
  let error: MockInstance;
  /** getHttpServer() is typed `any`. */
  const server = () => app.getHttpServer() as Server;

  beforeEach(async () => {
    vi.mocked(reportFault).mockClear();
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      imports: [Probe],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    error.mockRestore();
  });

  // A search term lands in the request's own log line only (#193).
  it('logs a 500 by its path, without the query', async () => {
    await request(server()).get('/orders?search=Wang%20Fang').expect(500);

    expect(error).toHaveBeenCalledWith(
      'GET /orders -> 500',
      expect.stringContaining('connection reset'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('Wang');
  });

  // ADR-084: by its reference and the route's pattern, never its address.
  it('reports a thrown error', async () => {
    await request(server()).get('/orders?search=Wang%20Fang').expect(500);

    expect(reportFault).toHaveBeenCalledTimes(1);
    expect(reportFault).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'connection reset' }),
      { reference: 'req-1', route: '/orders' },
    );
  });

  it.each([
    ['a 404', '/nowhere', {}, 404],
    ['a 409', '/orders/taken', {}, 409],
    [
      'an api_updating refusal',
      '/orders',
      { 'X-Api-Revision': String(API_REVISION + 1) },
      503,
    ],
  ])('reports no refusal: %s', async (_case, path, headers, status) => {
    await request(server()).get(path).set(headers).expect(status);

    expect(reportFault).not.toHaveBeenCalled();
  });
});
