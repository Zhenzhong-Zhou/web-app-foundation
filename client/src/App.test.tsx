import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_REVISION } from './api/revision.gen';
import App from './App';
import { AuthProvider } from './auth/auth-provider';
import { apiError } from './test/handlers';
import { server } from './test/setup';
import { BUILD } from './version/build';
import { checkVersion, noteServed } from './version/version-check';

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
  beforeEach(async () => {
    noteServed();
    await checkVersion();
    server.use(
      http.get('/api/v1/auth/me', () =>
        apiError(
          409,
          'This tab is running an older version of the app, so nothing was saved. Copy anything you typed, then reload.',
          'client_outdated',
        ),
      ),
    );
  });

  it('says a new version is ready once it is out', async () => {
    server.use(
      http.get('/version.json', () =>
        HttpResponse.json({
          ...BUILD,
          build: 'a1b2c3d',
          apiRevision: API_REVISION + 1,
        }),
      ),
    );
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
