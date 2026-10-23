import { act, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';
import { renderWithAuth } from '../test/render-with-auth';
import { OUTDATED, serveVersion } from '../test/version';
import { noteOutdated } from '../version/version-check';
import { LoadFailure } from './load-failure';

function renderFailure(failure: unknown, onRetry = vi.fn()) {
  renderWithAuth(
    <MemoryRouter>
      <LoadFailure
        failure={failure}
        message="The server's own words"
        missingTitle="This order doesn’t exist"
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
        name: 'This order doesn’t exist',
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
        name: 'You don’t have access to this',
      }),
    ).toBeTruthy();
    expect(screen.getByText(words)).toBeTruthy();
    expect(screen.queryByText(/ask an owner/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Go home' })).toBeTruthy();
  });

  it('says the server is out of reach when nothing answered, with Try again', async () => {
    const onRetry = renderFailure(new TypeError('Failed to fetch'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Can’t reach the server' }),
    ).toBeTruthy();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  // As the page that would not load does (ADR-081), so the two "Can't
  // reach the server" pages behave alike.
  it('reads the record again by itself when the connection comes back, and says so', () => {
    const onRetry = renderFailure(new TypeError('Failed to fetch'));
    expect(
      screen.getByText(
        'This page tries again by itself when your connection comes back.',
      ),
    ).toBeTruthy();
    expect(onRetry).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  describe('refused for this tab’s API revision (ADR-081)', () => {
    const outdated = () =>
      new ApiError(OUTDATED, 409, 'test-request', undefined, 'client_outdated');

    it('says a new version is ready once it is out, with Reload', async () => {
      serveVersion({ urgent: true });
      await noteOutdated();
      renderFailure(outdated());

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'A new version is ready',
        }),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
      expect(screen.queryByText("The server's own words")).toBeNull();
    });

    it('says it is being installed while the file names this build, and reads again by itself each minute', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      await noteOutdated();
      const onRetry = renderFailure(outdated());

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'A new version is being installed',
        }),
      ).toBeTruthy();
      expect(
        screen.getByText('This page tries again by itself in a minute.'),
      ).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();

      act(() => vi.advanceTimersByTime(59_000));
      expect(onRetry).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1_000));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('says the same for the API not yet deployed', () => {
      renderFailure(
        new ApiError(
          'A new version is being installed. Try again in a minute; nothing was saved.',
          503,
          'test-request',
          undefined,
          'api_updating',
        ),
      );
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'A new version is being installed',
        }),
      ).toBeTruthy();
    });
  });

  it('keeps the server’s words for any other failure', () => {
    renderFailure(new ApiError('Conflict', 409));
    expect(screen.getByText("The server's own words")).toBeTruthy();
  });
});
