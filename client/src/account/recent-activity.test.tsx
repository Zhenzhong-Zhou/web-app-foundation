import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { RecentActivity } from './recent-activity';

function event(action: string, id: string) {
  return {
    id,
    action,
    ip: null,
    userAgent: null,
    createdAt: new Date().toISOString(),
  };
}

describe('RecentActivity', () => {
  it('words leaving an organization and a deletion asked for or kept, never as codes', async () => {
    server.use(
      http.get('/api/v1/account/events', () =>
        HttpResponse.json([
          event('account.left_organization', 'e1'),
          event('account.deletion_requested', 'e2'),
          event('account.deletion_cancelled', 'e3'),
          event('account.organization_started', 'e4'),
        ]),
      ),
    );
    render(<RecentActivity />);

    expect(await screen.findByText('Left an organization')).toBeVisible();
    expect(screen.getByText('Account deletion requested')).toBeVisible();
    expect(screen.getByText('Account deletion cancelled')).toBeVisible();
    expect(screen.getByText('Started an organization')).toBeVisible();
    expect(screen.queryByText(/^account\./)).not.toBeInTheDocument();
  });

  describe('on a phone', () => {
    beforeEach(() => {
      // Every width query matches, as at 375 px; jsdom has no matchMedia.
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('puts a full IPv6 address under the event, free to wrap, with no From column to push When off screen (#323)', async () => {
      const ip = '2607:fea8:1b2c:3d00:a1b2:c3d4:e5f6:7890';
      server.use(
        http.get('/api/v1/account/events', () =>
          HttpResponse.json([{ ...event('session.created', 'e1'), ip }]),
        ),
      );
      render(<RecentActivity />);

      const address = await screen.findByText(ip);
      const cell = address.closest('td')!;
      expect(within(cell).getByText('Signed in')).toBeVisible();
      expect(address).toHaveStyle({ overflowWrap: 'anywhere' });
      expect(
        screen.queryByRole('columnheader', { name: 'From' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
      expect(screen.getByRole('columnheader', { name: 'When' })).toBeVisible();
    });
  });
});
