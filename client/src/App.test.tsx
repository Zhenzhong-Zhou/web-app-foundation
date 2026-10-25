import { render, screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './auth/auth-provider';
import { apiError } from './test/handlers';
import { server } from './test/setup';
import { outdatedRefusal, serveVersion } from './test/version';

const renderApp = (at = '/') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

const markUp = () => document.getElementById('loading-mark') !== null;

/** Longer than the spinner's delay, 250 ms (useDelayedFlag). */
const pastTheSpinnersDelay = () =>
  new Promise((resolve) => setTimeout(resolve, 400));

/**
 * index.html's loading mark (ADR-082) stays over the page until the first
 * screen is on view, and the app's own spinner waits under it, through a
 * cold start's minute too.
 */
describe('App, with the loading mark up', () => {
  beforeEach(() => {
    const mark = document.createElement('div');
    mark.id = 'loading-mark';
    document.body.append(mark);
  });

  afterEach(() => {
    document.getElementById('loading-mark')?.remove();
  });

  it('keeps it, and no spinner, while the session is read', async () => {
    server.use(http.get('/api/v1/auth/me', () => delay('infinite')));
    renderApp();

    await pastTheSpinnersDelay();

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(markUp()).toBe(true);
  });

  it('takes it down when the sign-in page is on view', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => apiError(401, 'Not signed in')),
    );
    renderApp('/login');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeVisible();
    expect(markUp()).toBe(false);
  });

  it('takes it down for Could not reach the server', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()));
    renderApp();

    expect(
      await screen.findByText('Could not reach the server.'),
    ).toBeVisible();
    expect(markUp()).toBe(false);
  });

  it('takes it down for the new-version page', async () => {
    server.use(http.get('/api/v1/auth/me', () => outdatedRefusal()));
    serveVersion({ urgent: true });
    renderApp();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is ready',
      }),
    ).toBeVisible();
    expect(markUp()).toBe(false);
  });
});

// Without the mark, as after the first screen: the spinner as before.
it('shows its spinner while the session is read, once the mark is down', async () => {
  server.use(http.get('/api/v1/auth/me', () => delay('infinite')));
  renderApp();

  expect(await screen.findByRole('progressbar')).toBeVisible();
});

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
