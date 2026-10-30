import { type INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import type { MockInstance } from 'vitest';

import { createTestApp, httpServer } from './utils/create-test-app';
import { RecordingTracker } from './utils/recording-tracker';

const TOO_LARGE = {
  en: 'That is too much to send at once. Shorten it, then try again.',
  'fr-CA':
    'C’est trop à envoyer en une fois. Raccourcissez-le, puis réessayez.',
  'zh-Hans': '一次发送的内容过多。请缩短后重试。',
};

const UNREADABLE = {
  en: 'The app could not read what was sent. Reload the page, then try again.',
  'fr-CA':
    'L’application n’a pas pu lire ce qui a été envoyé. Rechargez la page, puis réessayez.',
  'zh-Hans': '应用无法读取发送的内容。请重新加载页面后重试。',
};

/**
 * A body Express's parser refuses, before any route or guard runs: answered
 * with the parser's own 4xx, in the request's language, and never logged as
 * a fault or reported to the tracker (ADR-084), where it would be a 500
 * anyone could send to spend the month's reports.
 */
describe('Bodies the parser refuses (e2e)', () => {
  let app: INestApplication;
  let tracker: RecordingTracker;
  let error: MockInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    tracker = new RecordingTracker();
    tracker.start();
  });

  afterEach(async () => {
    await tracker.stop();
    error.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  function signIn(language: string) {
    return request(httpServer(app))
      .post('/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Accept-Language', language);
  }

  it('answers a JSON body over 100 KB with 413, and reports nothing', async () => {
    for (const [language, message] of Object.entries(TOO_LARGE)) {
      const res = await signIn(language)
        .send({ email: 'ana@example.com', password: 'x'.repeat(100 * 1024) })
        .expect(413);
      expect(res.body).toMatchObject({
        statusCode: 413,
        error: 'PAYLOAD_TOO_LARGE',
        message,
      });
    }

    expect(error).not.toHaveBeenCalled();
    expect(await tracker.sent()).toEqual([]);
  });

  it('answers malformed JSON with 400, never quoting it, and reports nothing', async () => {
    for (const [language, message] of Object.entries(UNREADABLE)) {
      const res = await signIn(language)
        .set('Content-Type', 'application/json')
        .send('{"email": "ana@example.com", "password": ')
        .expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        message,
      });
      expect(JSON.stringify(res.body)).not.toContain('ana@example.com');
    }

    expect(error).not.toHaveBeenCalled();
    expect(await tracker.sent()).toEqual([]);
  });
});
