import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext } from '../auth/auth-context';
import { browserTimeZone } from '../lib/time-zone';
import { server } from '../test/setup';
import { HomePage } from './home-page';

/** Home for an account that belongs to no organization (ADR-078). */
function renderHome(refresh = () => Promise.resolve()) {
  return render(
    <AuthContext.Provider
      value={{
        session: {
          user: {
            id: 'user-tom',
            email: 'tom.reid@example.com',
            name: 'Tom Reid',
            emailVerified: true,
            locale: null,
          },
          organization: null,
          permissions: [],
        },
        loading: false,
        error: null,
        refresh,
        signedOut: () => undefined,
      }}
    >
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('HomePage with no organization', () => {
  it('says how to join one, never the cards’ refusal', async () => {
    renderHome();

    expect(
      await screen.findByRole('heading', { name: 'Join an organization' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Ask someone in it to invite tom\.reid@example\.com/),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Go to your account' }),
    ).toHaveAttribute('href', '/account');
  });

  it('starts one where registration is open, in this browser’s zone', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v1/organization', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ user: {} }, { status: 201 });
      }),
    );
    const refresh = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    renderHome(refresh);

    await user.type(
      await screen.findByRole('textbox', { name: 'Organization name' }),
      'Reid Supply Co.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Start an organization' }),
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sent).toEqual({
      name: 'Reid Supply Co.',
      timeZone: browserTimeZone(),
    });
  });

  it('by invitation, says a link starts one, with no form', async () => {
    server.use(
      http.get('/api/v1/auth/registration', () =>
        HttpResponse.json({ registration: 'invitation' }),
      ),
    );
    renderHome();

    expect(
      await screen.findByText(/New organizations start from an invitation/),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Organization name' }),
    ).not.toBeInTheDocument();
  });

  it('turns into the explanation when Start is refused as closed', async () => {
    server.use(
      http.post('/api/v1/organization', () =>
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
    renderHome();

    await user.type(
      await screen.findByRole('textbox', { name: 'Organization name' }),
      'Reid Supply Co.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Start an organization' }),
    );

    expect(
      await screen.findByText(/New organizations start from an invitation/),
    ).toBeVisible();
    // Announced: the card's heading has the focus the button had.
    expect(
      screen.getByRole('heading', { name: 'Start an organization' }),
    ).toHaveFocus();
  });

  it('reads the session again when Start is refused as already decided elsewhere', async () => {
    server.use(
      http.post('/api/v1/organization', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message:
              'Your account is set to be deleted after 2026-11-18. Keep your account, then start an organization.',
            code: 'account_deletion_scheduled',
            details: { day: '2026-11-18' },
          },
          { status: 409 },
        ),
      ),
    );
    const refresh = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    renderHome(refresh);

    await user.type(
      await screen.findByRole('textbox', { name: 'Organization name' }),
      'Reid Supply Co.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Start an organization' }),
    );

    expect(
      await screen.findByText(/Keep your account, then start an organization/),
    ).toBeVisible();
    // So the deletion's banner, with Keep my account, can show.
    expect(refresh).toHaveBeenCalled();
  });
});
