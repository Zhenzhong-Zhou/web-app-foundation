import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';
import { renderWithAuth } from '../test/render-with-auth';
import { LoadFailure } from './load-failure';

function renderFailure(failure: unknown, onRetry = vi.fn()) {
  renderWithAuth(
    <MemoryRouter>
      <LoadFailure
        failure={failure}
        message="The server's own words"
        missingTitle="This order doesn't exist"
        list={{ to: '/orders', label: 'Orders' }}
        onRetry={onRetry}
      />
    </MemoryRouter>,
  );
  return onRetry;
}

describe('LoadFailure', () => {
  it('says a missing record does not exist, with its list and the lookup', () => {
    renderFailure(new ApiError('No such order', 404));
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "This order doesn't exist",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Go to Orders' }).getAttribute('href'),
    ).toBe('/orders');
    expect(
      screen.getByRole('button', { name: 'Search everything' }),
    ).toBeTruthy();
  });

  // The server's refusal names what the reader's roles lack and who could
  // give it (ADR-080, #148), so the page says it as sent.
  it('says a refused record is not the reader’s, in the server’s words', () => {
    const words =
      'Your role, Warehouse, doesn’t include “See what stock, lots and batches cost, and exchange rates”. Mei Lin can change your roles.';
    renderFailure(new ApiError(words, 403));
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(screen.getByText(words)).toBeTruthy();
    expect(screen.queryByText(/ask an owner/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Go home' })).toBeTruthy();
  });

  it('says the server is out of reach when nothing answered, with Try again', async () => {
    const onRetry = renderFailure(new TypeError('Failed to fetch'));
    expect(
      screen.getByRole('heading', { level: 1, name: "Can't reach the server" }),
    ).toBeTruthy();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('keeps the server’s words for any other failure', () => {
    renderFailure(new ApiError('Conflict', 409));
    expect(screen.getByText("The server's own words")).toBeTruthy();
  });
});
