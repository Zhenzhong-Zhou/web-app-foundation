import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

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
});
