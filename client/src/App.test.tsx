import { render, screen } from '@testing-library/react';
import { http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './auth/auth-provider';
import { server } from './test/setup';
import { outdatedRefusal, serveVersion } from './test/version';

const renderApp = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

/**
 * The first session read refused for this tab's API revision (ADR-081):
 * the server was reached, so the boot screen says why rather than "Could
 * not reach the server", whose Try again met the same refusal.
 */
describe('App, when the first session read is refused as outdated', () => {
  beforeEach(() => {
    server.use(http.get('/api/v1/auth/me', () => outdatedRefusal()));
  });

  it('says a new version is ready once it is out', async () => {
    serveVersion({ urgent: true });
    renderApp();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is ready',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });

  it('says it is being installed while the file names this build', async () => {
    renderApp();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is being installed',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });
});
