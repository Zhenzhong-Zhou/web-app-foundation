import { render, screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { AuthProvider } from './auth/auth-provider';
import { reportFault } from './errors/report-fault';
import { apiError } from './test/handlers';
import { server } from './test/setup';
import { outdatedRefusal, serveVersion } from './test/version';

/** A screen before sign-in broken in this build (#244); no other test here opens it. */
vi.mock('./auth/forgot-password-page', () => ({
  ForgotPasswordPage: () => {
    throw new Error('Forgot your password broken in this build');
  },
}));

vi.mock('./errors/report-fault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errors/report-fault')>()),
  reportFault: vi.fn(),
}));

const renderApp = (at = '/', container?: HTMLElement) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
    { container },
  );

const markUp = () => document.getElementById('loading-mark') !== null;

/** index.html's #root, hidden from screen readers while the mark is up. */
const rootHidden = () =>
  document.getElementById('root')?.getAttribute('aria-hidden') === 'true';

/** Longer than the spinner's delay, 250 ms (useDelayedFlag). */
const pastTheSpinnersDelay = () =>
  new Promise((resolve) => setTimeout(resolve, 400));

/**
 * index.html's loading mark (ADR-082) stays over the page until the first
 * screen is on view, and the app's own spinner waits under it, out of
 * screen readers' reach as all of #root is, through a cold start's minute
 * too. As index.html draws them: the app in #root, hidden, the mark beside.
 */
describe('App, with the loading mark up', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('div');
    mark.id = 'loading-mark';
    document.body.append(root, mark);
  });

  afterEach(() => {
    document.getElementById('loading-mark')?.remove();
    root.remove();
  });

  it('keeps it, and no spinner a screen reader finds, while the session is read', async () => {
    server.use(http.get('/api/v1/auth/me', () => delay('infinite')));
    renderApp('/', root);

    await pastTheSpinnersDelay();

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(markUp()).toBe(true);
    expect(rootHidden()).toBe(true);
  });

  it('takes it down when the sign-in page is on view', async () => {
    server.use(
      http.get('/api/v1/auth/me', () => apiError(401, 'Not signed in')),
    );
    renderApp('/login', root);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeVisible();
    expect(markUp()).toBe(false);
    expect(rootHidden()).toBe(false);
  });

  it('takes it down for Can’t reach the server, with Try again', async () => {
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.error()));
    renderApp('/', root);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Can’t reach the server',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(markUp()).toBe(false);
    expect(rootHidden()).toBe(false);
  });

  it('takes it down for the new-version page', async () => {
    server.use(http.get('/api/v1/auth/me', () => outdatedRefusal()));
    serveVersion({ urgent: true });
    renderApp('/', root);

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
 * A screen before sign-in that throws as it draws (#244): the crash page on
 * its own, in their frame, reported as a signed-in page's is. It was React
 * Router's default error page, in English, with the code's stack.
 */
it('shows the crash page before sign-in, with Reload and the reference it reports', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(reportFault).mockClear();
  server.use(http.get('/api/v1/auth/me', () => apiError(401, 'Not signed in')));
  renderApp('/forgot-password');

  const title = await screen.findByRole('heading', {
    level: 1,
    name: 'Something went wrong',
  });
  // In the frame of the screens before sign-in, with Reload alone: Go home
  // would lead to Sign in.
  expect(screen.getByRole('main')).toContainElement(title);
  expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Go home' })).toBeNull();

  const reference = screen
    .getByText(/^Reference:/)
    .querySelector('code')?.textContent;
  expect(reference).toEqual(expect.any(String));
  expect(reportFault).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
    reference,
  });
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
    expect(
      screen.queryByRole('heading', { name: 'Can’t reach the server' }),
    ).toBeNull();
  });

  it('says it is being installed while the file names this build', async () => {
    renderApp();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is being installed',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Can’t reach the server' }),
    ).toBeNull();
  });
});
