import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentSession, InvitationPreview } from '../api/types.gen';
import { server } from '../test/setup';
import { AuthContext } from './auth-context';
import { InvitationPage } from './invitation-page';

const TOKEN = 'a-token-of-forty-three-characters-000000000';

function preview(over: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    email: 'sam@example.com',
    organization: { name: 'Alpha Co', logo: null, deletionScheduledAt: null },
    inviter: { name: 'Mei Lin', email: 'mei.lin@example.com' },
    role: { name: 'Viewer', description: 'Looks at orders.' },
    note: 'Bring boots',
    lastDay: '2026-10-26',
    hasAccount: false,
    locale: 'en',
    ...over,
  };
}

/** Signed in as the invitation's address, in no organization yet. */
const SAM: CurrentSession = {
  user: {
    id: 'user-sam',
    email: 'sam@example.com',
    name: 'Sam Lee',
    emailVerified: true,
    locale: null,
  },
  organization: null,
  permissions: [],
};

function reads(invitation: InvitationPreview | null) {
  server.use(
    http.post('/api/v1/invitations/read', () =>
      HttpResponse.json({ invitation }),
    ),
  );
}

/**
 * The page at its link, with a session that refresh() sets to `after`,
 * as the real provider reads it again from the server.
 */
function open({
  session = null,
  after = session,
}: { session?: CurrentSession | null; after?: CurrentSession | null } = {}) {
  function Auth() {
    const [current, setCurrent] = useState(session);
    return (
      <AuthContext.Provider
        value={{
          session: current,
          loading: false,
          error: null,
          refresh: () => {
            setCurrent(after);
            return Promise.resolve();
          },
        }}
      >
        <MemoryRouter initialEntries={[`/invitation?token=${TOKEN}`]}>
          <Routes>
            <Route path="/invitation" element={<InvitationPage />} />
            <Route path="/" element={<p>Home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }
  return render(<Auth />);
}

/** A sentence whose words sit in several elements, bold role and all. */
const sentence = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text;

describe('InvitationPage (ADR-077)', () => {
  beforeEach(() => {
    // The page's language choice is remembered on the device.
    localStorage.clear();
  });

  it('names the inviter by name and by address, as the email does', async () => {
    reads(preview());
    open();

    expect(
      await screen.findByText(
        sentence('Mei Lin (mei.lin@example.com) invited you as a Viewer.'),
      ),
    ).toBeVisible();
    expect(screen.getByText('From Mei Lin')).toBeVisible();
  });

  it('names only the organization once the inviter has gone', async () => {
    reads(preview({ inviter: null }));
    open();

    expect(
      await screen.findByText(sentence('Alpha Co invited you as a Viewer.')),
    ).toBeVisible();
    expect(screen.getByText('From Alpha Co')).toBeVisible();
    expect(screen.queryByText(/Mei Lin/)).not.toBeInTheDocument();
  });

  it('reads an ended link as ended, by its code', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/invitations/accept', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'This invitation has ended.',
            code: 'invitation_ended',
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Sam',
    );
    await user.type(
      screen.getByLabelText(/^Choose a password/),
      'a-password-of-mine',
    );
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));
    expect(
      await screen.findByRole('heading', { name: 'This invitation has ended' }),
    ).toBeVisible();
  });

  it('says a field the server refused as it says it, the link still live', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/invitations/accept', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'name must be longer than or equal to 1 characters',
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      '   ',
    );
    await user.type(
      screen.getByLabelText(/^Choose a password/),
      'a-password-of-mine',
    );
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));
    expect(
      await screen.findByText(
        'name must be longer than or equal to 1 characters',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeEnabled();
    expect(
      screen.queryByRole('heading', { name: 'This invitation has ended' }),
    ).not.toBeInTheDocument();
  });

  it('starts in the invitation’s language for a newcomer', async () => {
    reads(preview({ locale: 'fr-CA' }));
    open();

    expect(
      await screen.findByRole('heading', { name: 'Joignez-vous à Alpha Co' }),
    ).toBeVisible();
  });

  it('keeps a signed-in account in its own language', async () => {
    reads(preview({ locale: 'fr-CA' }));
    open({ session: SAM });

    expect(
      await screen.findByRole('button', { name: 'Join Alpha Co' }),
    ).toBeVisible();
    expect(localStorage.getItem('language')).toBeNull();
  });

  it('joins as the account it signed in to when Join was refused just after, signing in once', async () => {
    reads(preview({ hasAccount: true }));
    let signIns = 0;
    let joins = 0;
    server.use(
      http.post('/api/v1/auth/login', () => {
        signIns += 1;
        return HttpResponse.json({ user: SAM.user });
      }),
      http.post('/api/v1/invitations/accept', () => {
        joins += 1;
        return joins === 1
          ? HttpResponse.json(
              { statusCode: 503, message: 'The server is busy.' },
              { status: 503 },
            )
          : HttpResponse.json({ user: SAM.user });
      }),
    );
    const user = userEvent.setup();
    open({ after: SAM });

    await user.type(
      await screen.findByLabelText(/^Password/),
      'my-own-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in and join' }));

    // Signed in now: Join as that account, the refusal carried with it.
    expect(await screen.findByText('The server is busy.')).toBeVisible();
    expect(
      screen.getByText(/You’re signed in as sam@example\.com\./),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Join Alpha Co' }));

    expect(await screen.findByText('Home')).toBeVisible();
    expect({ signIns, joins }).toEqual({ signIns: 1, joins: 2 });
  });

  it('keeps the form as typed, in its language, when a read in another fails', async () => {
    let tries = 0;
    server.use(
      http.post('/api/v1/invitations/read', () => {
        tries += 1;
        return tries === 1
          ? HttpResponse.json({ invitation: preview() })
          : HttpResponse.json(
              { statusCode: 429, message: 'Too many requests' },
              { status: 429 },
            );
      }),
    );
    const user = userEvent.setup();
    open();

    await user.type(
      await screen.findByRole('textbox', { name: 'Your name' }),
      'Sam Lee',
    );
    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(
      screen.getByRole('option', { name: 'Français (Canada) — bêta' }),
    );

    expect(
      await screen.findByText(
        'The page couldn’t change language just now, so it stays as it was. Try again in a minute.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue(
      'Sam Lee',
    );
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeVisible();
    expect(
      screen.queryByText('This invitation could not be opened'),
    ).not.toBeInTheDocument();
    expect(tries).toBe(2);
  });

  it('says so when Not you? Sign out fails, and stays', async () => {
    reads(preview());
    server.use(
      http.post('/api/v1/auth/logout', () =>
        HttpResponse.json(
          { statusCode: 503, message: 'The server is busy.' },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    open({ session: SAM });

    await user.click(
      await screen.findByRole('button', { name: 'Not you? Sign out' }),
    );
    expect(await screen.findByText('The server is busy.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Join Alpha Co' })).toBeVisible();
  });

  it('offers Try again when the invitation could not be read', async () => {
    let tries = 0;
    server.use(
      http.post('/api/v1/invitations/read', () => {
        tries += 1;
        return tries === 1
          ? HttpResponse.json(
              { statusCode: 503, message: 'The server is busy.' },
              { status: 503 },
            )
          : HttpResponse.json({ invitation: preview() });
      }),
    );
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Join Alpha Co' }),
    ).toBeVisible();
  });
});
