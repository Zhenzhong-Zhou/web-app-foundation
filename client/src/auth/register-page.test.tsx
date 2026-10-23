import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { browserTimeZone } from '../lib/time-zone';
import { server } from '../test/setup';
import { deploy, OUTDATED, outdatedRefusal } from '../test/version';
import { AuthContext } from './auth-context';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';

function renderAt(path: '/register' | '/login') {
  return render(
    <AuthContext.Provider
      value={{
        session: null,
        loading: false,
        error: null,
        refresh: () => Promise.resolve(),
        signedOut: () => undefined,
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function byInvitation() {
  server.use(
    http.get('/api/v1/auth/registration', () =>
      HttpResponse.json({ registration: 'invitation' }),
    ),
  );
}

describe('RegisterPage', () => {
  // ADR-072's watch list: the new organization starts in this browser's zone.
  it('sends this browser’s zone with the registration', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/auth/register', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ user: {} }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Mei Lin',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Company name' }),
      'Northside',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'mei@example.com',
    );
    await user.type(screen.getByLabelText(/^Password/), 'a-password-of-mine');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Home')).toBeVisible();
    expect(sent).toMatchObject({ timeZone: browserTimeZone() });
  });

  it('by invitation, explains how to get one instead of a form (ADR-078)', async () => {
    byInvitation();
    renderAt('/register');

    expect(
      await screen.findByRole('heading', {
        name: 'Accounts here start from an invitation',
      }),
    ).toBeVisible();
    expect(screen.getByText('Joining where you work')).toBeVisible();
    expect(screen.getByText('Starting a new organization')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Your name' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  it('turns into the explanation when the form is refused as closed', async () => {
    server.use(
      http.post('/api/v1/auth/register', () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'New organizations join by invitation here.',
            code: 'registration_closed',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt('/register');

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Mei Lin',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Company name' }),
      'Northside',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'mei@example.com',
    );
    await user.type(screen.getByLabelText(/^Password/), 'a-password-of-mine');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const heading = await screen.findByRole('heading', {
      name: 'Accounts here start from an invitation',
    });
    expect(heading).toBeVisible();
    // Announced: the heading has the focus the button had.
    expect(heading).toHaveFocus();
  });

  it('shows the signed-out frame while the setting is read, then a spinner', async () => {
    server.use(
      http.get('/api/v1/auth/registration', async () => {
        await delay('infinite');
        return HttpResponse.json({ registration: 'open' });
      }),
    );
    renderAt('/register');

    // The language and the text size, before anything is known.
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Your name' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('progressbar')).toBeVisible();
  });
});

describe('LoginPage and registration (ADR-078)', () => {
  it('offers Create an account where registration is open', async () => {
    renderAt('/login');

    expect(
      await screen.findByRole('link', { name: 'Create an account' }),
    ).toBeVisible();
  });

  it('by invitation, links to how to get one instead', async () => {
    byInvitation();
    renderAt('/login');

    expect(
      await screen.findByRole('link', { name: 'How to get one' }),
    ).toHaveAttribute('href', '/register');
    expect(
      screen.queryByRole('link', { name: 'Create an account' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * A sign-in refused for this tab's API revision (ADR-081): while the new
 * version is still on its way, it is being installed; once it is out, the
 * server's words, which say to reload. Worded as the page renders, so the
 * line changes with it.
 */
describe('LoginPage refused as outdated', () => {
  it('says the new version is being installed, then, once it is out, to reload', async () => {
    server.use(http.post('/api/v1/auth/login', () => outdatedRefusal()));
    const user = userEvent.setup();
    renderAt('/login');

    await user.type(
      await screen.findByRole('textbox', { name: 'Email' }),
      'mei@example.com',
    );
    await user.type(screen.getByLabelText(/^Password/), 'a long password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        'A new version is being installed. Try again in a minute; nothing was saved.',
      ),
    ).toBeVisible();

    await deploy({ urgent: true });
    expect(screen.getByText(OUTDATED)).toBeVisible();
  });
});
