import { parseEnvelope } from '@sentry/core';

import { eventOf } from '../errors/report-body';
import { reportAddress, STAND_IN, testReport } from './error-tracker-report';
import { UsageError } from './org-invite-options';

describe('npm run error-tracker:test', () => {
  it('builds an envelope the route relays, naming the stand-in project', () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const { id, body } = testReport(now);

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const [header, items] = parseEnvelope(body);
    expect(header).toEqual({
      event_id: id,
      sent_at: '2026-10-30T12:00:00.000Z',
      dsn: STAND_IN,
    });
    expect(items).toHaveLength(1);
    expect(items[0][0]).toEqual({ type: 'event' });

    // What POST /errors reads of it, scrubbed: the report, unchanged.
    expect(eventOf(Buffer.from(body))).toEqual(
      expect.objectContaining({
        event_id: id,
        timestamp: now.getTime() / 1000,
        level: 'error',
        exception: {
          values: [
            expect.objectContaining({
              type: 'Error',
              value: 'A test report, sent by npm run error-tracker:test',
            }),
          ],
        },
      }),
    );
  });

  it('gives each report its own id', () => {
    expect(testReport().id).not.toBe(testReport().id);
  });

  it('posts to the site’s /api/errors', () => {
    expect(reportAddress(['http://localhost:5173']).href).toBe(
      'http://localhost:5173/api/errors',
    );
    expect(
      reportAddress(['https://web-app-foundation-client.onrender.com/']).href,
    ).toBe('https://web-app-foundation-client.onrender.com/api/errors');
  });

  it('refuses anything but one site’s address', () => {
    for (const argv of [
      [],
      ['http://localhost:5173', 'http://localhost:3000'],
      ['--dsn', 'x'],
      ['localhost'],
      ['localhost:5173'],
      ['ftp://example.com'],
    ]) {
      expect(() => reportAddress(argv)).toThrow(UsageError);
    }
  });
});
