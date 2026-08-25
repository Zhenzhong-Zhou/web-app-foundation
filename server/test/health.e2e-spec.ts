import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;
  
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleRef.createNestApplication();
    await app.init();
  });
  
  afterAll(async () => {
    await app.close();   // closes the pg pool — without this Jest hangs
  });
  
  it('GET /health returns 200', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });
});