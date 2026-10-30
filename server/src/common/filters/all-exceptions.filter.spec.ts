import { Controller, Get, type INestApplication, Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { MockInstance } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter';

@Controller('orders')
class Broken {
  @Get()
  list(): never {
    throw new Error('connection reset');
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;
  let error: MockInstance;

  beforeEach(async () => {
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      controllers: [Broken],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
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
    await request(app.getHttpServer())
      .get('/orders?search=Wang%20Fang')
      .expect(500);

    expect(error).toHaveBeenCalledWith(
      'GET /orders -> 500',
      expect.stringContaining('connection reset'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('Wang');
  });
});
