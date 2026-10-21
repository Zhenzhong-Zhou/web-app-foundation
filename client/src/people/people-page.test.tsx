import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Person } from '../api/types.gen';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { roleRef } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { PeoplePage } from './people-page';

const person = (id: string, name: string, memberSince: string): Person => ({
  id,
  name,
  email: `${id}@alpha.example`,
  photoFileId: null,
  roles: [roleRef('Viewer')],
  jobTitle: null,
  department: null,
  location: null,
  workPhone: null,
  extension: null,
  memberSince,
  active: 'today',
});

/**
 * Who is new (ADR-079): whoever joined in the last two weeks, the
 * welcome's two weeks, counted in the organization's days.
 */
describe('People', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    setOrganizationTimeZone('UTC');
  });
  afterEach(() => {
    vi.useRealTimers();
    setOrganizationTimeZone(null);
  });

  it('marks who joined in the last two weeks, and says how many', async () => {
    server.use(
      http.get('/api/v1/people', () =>
        HttpResponse.json([
          person('arjun', 'Arjun Patel', '2026-03-02T16:00:00.000Z'),
          person('li', 'Li Na', '2026-10-16T16:00:00.000Z'),
          // The last day of their two weeks.
          person('sam', 'Sam Okafor', '2026-10-06T09:00:00.000Z'),
          // A day past them.
          person('tom', 'Tom Reid', '2026-10-05T09:00:00.000Z'),
          person('wang', 'Wang Fang', '2026-10-20T08:00:00.000Z'),
        ]),
      ),
    );

    renderWithAuth(
      <MemoryRouter>
        <PeoplePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        'Everyone in Alpha Co, 5 people. 3 joined in the last two weeks.',
      ),
    ).toBeVisible();

    const card = (name: string) =>
      screen.getByRole('link', { name }).closest('article') as HTMLElement;
    expect(
      within(card('Li Na')).getByText('New · joined Oct 16'),
    ).toBeVisible();
    expect(
      within(card('Wang Fang')).getByText('New · joined today'),
    ).toBeVisible();
    expect(
      within(card('Sam Okafor')).getByText('New · joined Oct 6'),
    ).toBeVisible();
    expect(within(card('Tom Reid')).queryByText(/^New/)).toBeNull();
    expect(within(card('Arjun Patel')).queryByText(/^New/)).toBeNull();
  });

  it('says only how many people there are when nobody is new', async () => {
    server.use(
      http.get('/api/v1/people', () =>
        HttpResponse.json([
          person('arjun', 'Arjun Patel', '2026-03-02T16:00:00.000Z'),
        ]),
      ),
    );

    renderWithAuth(
      <MemoryRouter>
        <PeoplePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Everyone in Alpha Co, 1 person.'),
    ).toBeVisible();
    expect(screen.queryByText(/^New/)).toBeNull();
  });
});
