import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { setOrganizationTimeZone } from '../lib/time-zone';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { AuditPage } from './audit-page';

/**
 * The audit log's dates (ADR-057, ADR-072): the days picked, as the moments
 * they begin and end where the organization is, the last day whole.
 */
describe('AuditPage', () => {
  afterEach(() => setOrganizationTimeZone(null));

  it('asks for the whole of the last day, up to the next midnight in the organization’s zone', async () => {
    setOrganizationTimeZone('America/Vancouver');
    const asked: URL[] = [];
    server.use(
      http.get('/api/v1/audit', ({ request }) => {
        asked.push(new URL(request.url));
        return HttpResponse.json({ entries: [], nextCursor: null });
      }),
      http.get('/api/v1/audit/actions', () => HttpResponse.json([])),
    );

    renderWithAuth(
      <MemoryRouter initialEntries={['/audit?from=2026-10-01&to=2026-10-07']}>
        <AuditPage />
      </MemoryRouter>,
      { permissions: ['audit.view'] },
    );

    await expect.poll(() => asked.length).toBeGreaterThan(0);
    const query = asked[0].searchParams;
    expect(query.get('from')).toBe('2026-10-01T07:00:00.000Z');
    // Midnight after 7 October in Vancouver: all of the 7th, none of the 8th.
    expect(query.get('until')).toBe('2026-10-08T07:00:00.000Z');
    expect(query.has('to')).toBe(false);
  });
});
